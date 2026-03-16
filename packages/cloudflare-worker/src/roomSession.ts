import { Env } from './index';

interface Session {
  id: string;
  userId?: string;
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
        const metadata = ws.deserializeAttachment() as any;
        this.sessions.set(ws, { 
          id: metadata?.id || crypto.randomUUID(),
          userId: metadata?.userId 
        });
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
    const userId = request.headers.get('X-User-Id') || undefined;

    this.state.acceptWebSocket(server);
    this.sessions.set(server, { id: sessionId, userId });

    // Cancel any pending alarms (room empty flush) since a user joined
    await this.state.storage.deleteAlarm();

    // Store room ID derived from the request URL path
    const url = new URL(request.url);
    const roomId = url.pathname.split('/').filter(Boolean).pop() || 'unknown';
    await this.state.storage.put('roomId', roomId);

    server.serializeAttachment({ id: sessionId, userId });

    const activeUsers = Array.from(this.sessions.values()).map(s => ({ userId: s.userId, sessionId: s.id }));
    server.send(JSON.stringify({ type: 'presence', payload: { action: 'sync', users: activeUsers, yourSessionId: sessionId } }));

    this.broadcast(JSON.stringify({ type: 'presence', payload: { action: 'join', userId, sessionId } }), server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private broadcast(message: string, excludeWs?: WebSocket) {
    for (const [clientPs] of this.sessions) {
      if (clientPs !== excludeWs) {
        try {
          clientPs.send(message);
        } catch (e) {
          this.sessions.delete(clientPs);
        }
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    const data = JSON.parse(message);
    let broadcastMessage = message as string;

    if (data.type === 'webrtc-signal') {
      const senderSession = this.sessions.get(ws);
      data.senderId = senderSession?.userId || senderSession?.id || 'anonymous';
      const outgoingMessage = JSON.stringify(data);

      const targetUserId = data.payload?.targetUserId;
      if (targetUserId) {
        let targetFound = false;
        for (const [clientWs, session] of this.sessions.entries()) {
          // Match either the authenticated userId or the anonymous session id
          if (session.userId === targetUserId || session.id === targetUserId) {
            targetFound = true;
            try {
              clientWs.send(outgoingMessage);
            } catch (e) {
              this.sessions.delete(clientWs);
            }
          }
        }
        if (targetFound) return;
        return; // Don't broadcast targeted signals if target is disconnected
      }
      
      // If we fall through (e.g. general broadcast offer), broadcast the injected message
      broadcastMessage = outgoingMessage;
    }

    // Keep cursors/RTC purely in memory, broadcast immediately
    // For chat messages, persist to storage first, then broadcast
    if (data.type === 'chat') {
      // Chat persistence logic
      const chats = await this.state.storage.get<any[]>('chats') || [];
      chats.push({
        ...data.payload,
        timestamp: Date.now(),
        senderId: this.sessions.get(ws)?.userId || this.sessions.get(ws)?.id || 'anonymous'
      });
      await this.state.storage.put('chats', chats);
    }

    // Broadcast to all *other* connected clients
    this.broadcast(broadcastMessage, ws);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    
    if (session) {
      this.broadcast(JSON.stringify({ type: 'presence', payload: { action: 'leave', userId: session.userId, sessionId: session.id } }));
    }
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
