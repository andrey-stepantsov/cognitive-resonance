import { Env } from './index';

interface NodeInfo {
  id: string;
  ws: WebSocket;
  telemetry?: {
    freeMemMB: number;
    loadAvg: number;
    activeContainers: number;
    uptime: number;
  };
  lastSeen: number;
}

export class NodeRegistry {
  private state: DurableObjectState;
  private env: Env;
  private nodes: Map<WebSocket, NodeInfo> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Restore existing webhooks on restart
    this.state.getWebSockets().forEach((ws) => {
      this.nodes.set(ws, {
        id: crypto.randomUUID(),
        ws,
        lastSeen: Date.now()
      });
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const { 0: client, 1: server } = new WebSocketPair();
      this.state.acceptWebSocket(server);
      
      this.nodes.set(server, {
        id: crypto.randomUUID(),
        ws: server,
        lastSeen: Date.now()
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST') {
      if (this.nodes.size === 0) {
        return new Response(JSON.stringify({ error: 'No Phantomachine Executors connected' }), { status: 503 });
      }

      // Cleanup stale nodes (no telemetry for 30s)
      const now = Date.now();
      for (const [ws, info] of this.nodes.entries()) {
        if (now - info.lastSeen > 30000) {
           try { ws.close(); } catch(e){}
           this.nodes.delete(ws);
        }
      }

      if (this.nodes.size === 0) {
        return new Response(JSON.stringify({ error: 'No Phantomachine Executors available' }), { status: 503 });
      }

      // Load-balancing heuristic: Find node with most free memory
      let bestNode: NodeInfo | null = null;
      let maxMem = -1;

      for (const info of this.nodes.values()) {
         if (info.telemetry) {
            if (info.telemetry.freeMemMB > maxMem) {
               maxMem = info.telemetry.freeMemMB;
               bestNode = info;
            }
         }
      }

      // Fallback if no telemetry yet
      if (!bestNode) {
         bestNode = Array.from(this.nodes.values())[0];
      }

      const eventJson = await request.text();
      try {
        bestNode.ws.send(eventJson);
        return new Response(JSON.stringify({ ok: true, dispatchedTo: bestNode.id }));
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to transmit to Phantomachine' }), { status: 500 });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'NODE_TELEMETRY') {
         const node = this.nodes.get(ws);
         if (node) {
            node.telemetry = data.payload;
            node.lastSeen = Date.now();
         }
         return; // Telemetry handled natively
      }

      const executionEventId = data.payload?.id;

      if (executionEventId) {
        // Resolve original execution request to find its origin session_id
        const row = await this.env.DB.prepare('SELECT session_id FROM events WHERE id = ?').bind(executionEventId).first();
        if (row && row.session_id) {
          const roomStub = this.env.ROOM_SESSION.get(this.env.ROOM_SESSION.idFromName(row.session_id as string));
          
          await roomStub.fetch(new Request(`https://worker/internalMessage`, {
            method: 'POST',
            body: JSON.stringify(data)
          }));
        }
      }
    } catch (e) {
      console.error('[NodeRegistry] Message parsing/routing failed', e);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.nodes.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: any) {
    this.nodes.delete(ws);
  }
}
