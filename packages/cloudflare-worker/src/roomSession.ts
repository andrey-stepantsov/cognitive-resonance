import { Env } from './index';

interface Session {
  id: string;
}

export class RoomSession {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, Session>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();

    // Ensure state bindings are available if Cloudflare restarts the isolate
    this.state.getWebSockets().forEach((ws) => {
      try {
        const metadata = this.state.getWebSocketAutoResponse(ws) as any;
        this.sessions.set(ws, { id: metadata?.id || crypto.randomUUID() });
      } catch (e) {
        this.sessions.set(ws, { id: crypto.randomUUID() });
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const sessionId = crypto.randomUUID();

    this.state.acceptWebSocket(server);
    this.sessions.set(server, { id: sessionId });

    // Cancel any pending alarms (room empty flush) since a user joined
    await this.state.storage.deleteAlarm();

    // Store room ID derived from the request URL path
    const url = new URL(request.url);
    const roomId = url.pathname.split('/').filter(Boolean).pop() || 'unknown';
    await this.state.storage.put('roomId', roomId);

    server.serializeAttachment({ id: sessionId });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    const data = JSON.parse(message);

    // Keep cursors/RTC purely in memory, broadcast immediately
    // For chat messages, persist to storage first, then broadcast
    if (data.type === 'chat') {
      // Chat persistence logic
      const chats = await this.state.storage.get<any[]>('chats') || [];
      chats.push({
        ...data.payload,
        timestamp: Date.now(),
        senderId: this.sessions.get(ws)?.id
      });
      await this.state.storage.put('chats', chats);
    }

    // Broadcast to all *other* connected clients
    for (const [clientPs] of this.sessions) {
      if (clientPs !== ws) {
        try {
          clientPs.send(message);
        } catch (e) {
          this.sessions.delete(clientPs);
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.sessions.delete(ws);
    // If the room is empty, schedule a background flush
    if (this.sessions.size === 0) {
      // 10 second delay for page reloads / fast reconnects
      await this.state.storage.setAlarm(Date.now() + 10000);
    }
  }

  async webSocketError(ws: WebSocket, error: any) {
    this.sessions.delete(ws);
  }

  async alarm() {
    // Room has been empty for 10 seconds — flush chat history to D1.
    console.log("Room empty. Triggering alarm flush...");
    
    const chats = await this.state.storage.get<any[]>('chats');
    if (!chats || chats.length === 0) {
      return;
    }

    const roomId = await this.state.storage.get<string>('roomId') || 'unknown';

    try {
      // Batch INSERT chats into D1 room_chats table
      const stmt = this.env.DB.prepare(
        'INSERT INTO room_chats (room_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)'
      );

      const batch = chats.map((chat) =>
        stmt.bind(
          roomId,
          chat.senderId || 'anonymous',
          typeof chat.message === 'string' ? chat.message : JSON.stringify(chat),
          chat.timestamp || Date.now()
        )
      );

      await this.env.DB.batch(batch);

      // Successfully written — clear DO storage
      await this.state.storage.delete('chats');
      console.log(`Successfully flushed ${chats.length} chats for room ${roomId} to D1.`);
    } catch (err) {
      // D1 write failed — re-schedule alarm for retry in 30 seconds
      console.error(`Failed to flush chats to D1 for room ${roomId}:`, err);
      await this.state.storage.setAlarm(Date.now() + 30000);
    }
  }
}
