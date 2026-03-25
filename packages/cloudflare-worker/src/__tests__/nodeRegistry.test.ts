import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeRegistry } from '../nodeRegistry';

// ─── Mock Factories ─────────────────────────────────────────────

function makeDurableObjectState() {
  return {
    getWebSockets: vi.fn(() => []),
    acceptWebSocket: vi.fn(),
  } as unknown as DurableObjectState;
}

function makeEnv(dbOverrides: Record<string, any> = {}) {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ session_id: 'test-room-id' })
        })
      }),
      ...dbOverrides,
    },
    ROOM_SESSION: {
      idFromName: vi.fn().mockReturnValue('room-id-123'),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response('ok'))
      })
    }
  } as any;
}

/** Simulate a WebSocket for Node test environment. */
function makeMockWebSocket() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
  } as unknown as WebSocket;
}

// Stub global WebSocketPair for the test environment
const webSocketPairs: Array<{ client: WebSocket; server: WebSocket }> = [];
(globalThis as any).WebSocketPair = class {
  0: WebSocket;
  1: WebSocket;
  constructor() {
    const client = makeMockWebSocket();
    const server = makeMockWebSocket();
    this[0] = client;
    this[1] = server;
    webSocketPairs.push({ client, server });
  }
};

// Stub crypto.randomUUID if not available
if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  (globalThis as any).crypto = {
    ...(globalThis.crypto || {}),
    randomUUID: () => `test-uuid-${++counter}`,
  };
}

// Patch Response to accept status 101
const OriginalResponse = globalThis.Response;
(globalThis as any).Response = class PatchedResponse extends OriginalResponse {
  webSocket?: WebSocket;

  constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: WebSocket }) {
    const status = init?.status;
    if (status === 101) {
      super(body, { ...init, status: 200 });
      Object.defineProperty(this, 'status', { value: 101 });
      this.webSocket = init?.webSocket;
    } else {
      super(body, init);
      if ((init as any)?.webSocket) {
        this.webSocket = (init as any).webSocket;
      }
    }
  }
};

// ─── Tests ──────────────────────────────────────────────────────

describe('NodeRegistry', () => {
  let state: DurableObjectState;
  let env: ReturnType<typeof makeEnv>;
  let registry: NodeRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    webSocketPairs.length = 0;
    state = makeDurableObjectState();
    env = makeEnv();
    registry = new NodeRegistry(state, env);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('WebSocket Connection', () => {
    it('returns 101 with webSocket property on Upgrade request', async () => {
      const request = new Request('http://localhost', {
        headers: { 'Upgrade': 'websocket' },
      });

      const response = await registry.fetch(request);

      expect(response.status).toBe(101);
      expect((response as any).webSocket).toBeDefined();
      expect(state.acceptWebSocket).toHaveBeenCalled();
    });
  });

  describe('Load Balancing Heuristics', () => {
    it('returns 503 if no daemons are connected on POST execution', async () => {
      const request = new Request('http://localhost', { method: 'POST', body: '{"payload":{"id":"task-1"}}' });
      const response = await registry.fetch(request);
      expect(response.status).toBe(503);
      const json = await response.json() as any;
      expect(json.error).toBe('No Phantomachine Executors connected');
    });

    it('routes POST to the daemon with highest freeMemMB', async () => {
      const req1 = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });
      const req2 = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });
      const req3 = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });

      await registry.fetch(req1); const ws1 = webSocketPairs[0].server;
      await registry.fetch(req2); const ws2 = webSocketPairs[1].server;
      await registry.fetch(req3); const ws3 = webSocketPairs[2].server;

      await registry.webSocketMessage(ws1, JSON.stringify({ type: 'NODE_TELEMETRY', payload: { freeMemMB: 1000 } }));
      await registry.webSocketMessage(ws2, JSON.stringify({ type: 'NODE_TELEMETRY', payload: { freeMemMB: 4000 } }));
      await registry.webSocketMessage(ws3, JSON.stringify({ type: 'NODE_TELEMETRY', payload: { freeMemMB: 2000 } }));

      const postReq = new Request('http://localhost', { method: 'POST', body: '{"payload":{"id":"task-1"}}' });
      const res = await registry.fetch(postReq);
      expect(res.status).toBe(200);

      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalledWith('{"payload":{"id":"task-1"}}');
      expect(ws3.send).not.toHaveBeenCalled();
    });

    it('garbage collects stale daemons and drops them from routing', async () => {
      const req = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });
      await registry.fetch(req);
      const ws1 = webSocketPairs[0].server;

      await registry.webSocketMessage(ws1, JSON.stringify({ type: 'NODE_TELEMETRY', payload: { freeMemMB: 1000 } }));

      // Advance by 31 seconds (past 30s threshold)
      vi.advanceTimersByTime(31000);

      const postReq = new Request('http://localhost', { method: 'POST', body: '{"payload":{"id":"task-2"}}' });
      const res = await registry.fetch(postReq);
      
      expect(res.status).toBe(503);
      expect(ws1.close).toHaveBeenCalled();
    });
  });

  describe('Upstream Messaging', () => {
    it('routes task output payload back to the correct room session', async () => {
      const req = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });
      await registry.fetch(req);
      const ws1 = webSocketPairs[0].server;

      const messageJson = JSON.stringify({ type: 'STDOUT_CHUNK', payload: { id: 'evt-123', chunk: 'hello' } });
      await registry.webSocketMessage(ws1, messageJson);

      expect(env.DB.prepare).toHaveBeenCalledWith('SELECT session_id FROM events WHERE id = ?');
      const roomStub = env.ROOM_SESSION.get(env.ROOM_SESSION.idFromName('test'));
      expect(roomStub.fetch).toHaveBeenCalled();
    });
  });

  describe('Disconnections', () => {
    it('removes daemon on webSocketClose', async () => {
      const req = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });
      await registry.fetch(req);
      const ws1 = webSocketPairs[0].server;

      await registry.webSocketClose(ws1, 1000, 'normal', true);

      const postReq = new Request('http://localhost', { method: 'POST', body: '{"payload":{"id":"task-1"}}' });
      const res = await registry.fetch(postReq);
      expect(res.status).toBe(503);
    });

    it('removes daemon on webSocketError', async () => {
      const req = new Request('http://localhost', { headers: { 'Upgrade': 'websocket' } });
      await registry.fetch(req);
      const ws1 = webSocketPairs[0].server;

      await registry.webSocketError(ws1, new Error('bad'));

      const postReq = new Request('http://localhost', { method: 'POST', body: '{"payload":{"id":"task-1"}}' });
      const res = await registry.fetch(postReq);
      expect(res.status).toBe(503);
    });
  });
});
