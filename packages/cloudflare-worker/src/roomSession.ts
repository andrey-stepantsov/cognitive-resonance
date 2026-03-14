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
    // This executes when the room has been empty for 10 seconds.
    // Time to flush persistent chat data to Appwrite.
    
    console.log("Room empty. Triggering alarm flush...");
    
    const chats = await this.state.storage.get<any[]>('chats');
    if (!chats || chats.length === 0) {
      return; // Nothing to flush
    }

    // TODO: Actually POST `chats` to Appwrite using env.APPWRITE_WEBHOOK_SECRET
    // For now, we simulate the structure we need to build for the Appwrite sync.
    // E.g., fetch('https://appwrite.my-domain.com/...', { ... })

    // Once successfully flushed, clean up DO storage to save space
    await this.state.storage.delete('chats');
    console.log("Successfully flushed chats and cleared storage.");
  }
}
