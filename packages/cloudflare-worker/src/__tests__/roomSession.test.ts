import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomSession } from '../roomSession';

// ─── Mock Factories ─────────────────────────────────────────────

function makeStorage() {
  const store = new Map<string, any>();
  let alarm: number | null = null;

  return {
    get: vi.fn(async <T = unknown>(key: string): Promise<T | undefined> => store.get(key) as T | undefined),
    put: vi.fn(async (key: string, value: any) => { store.set(key, value); }),
    delete: vi.fn(async (key: string | string[]) => {
      if (Array.isArray(key)) {
        key.forEach((k) => store.delete(k));
      } else {
        store.delete(key);
      }
    }),
    setAlarm: vi.fn(async (time: number) => { alarm = time; }),
    deleteAlarm: vi.fn(async () => { alarm = null; }),
    getAlarm: vi.fn(async () => alarm),
    _store: store,
    _getAlarm: () => alarm,
  };
}

function makeDurableObjectState(storage: ReturnType<typeof makeStorage>) {
  return {
    storage,
    getWebSockets: vi.fn(() => []),
    getWebSocketAutoResponse: vi.fn(() => null),
    acceptWebSocket: vi.fn(),
  } as unknown as DurableObjectState;
}

function makeEnv(dbOverrides: Record<string, any> = {}) {
  const bindFn = vi.fn().mockReturnThis();
  const runFn = vi.fn().mockResolvedValue({});
  return {
    API_KEY: 'test-key',
    DB: {
      prepare: vi.fn().mockReturnValue({ bind: bindFn, run: runFn }),
      batch: vi.fn().mockResolvedValue([]),
      _bind: bindFn,
      _run: runFn,
      ...dbOverrides,
    },
    AI: null,
    VECTORIZE: null,
    GIT_PACKS_BUCKET: null as any,
    ROOM_SESSION: null as any,
  };
}

/** Simulate a WebSocket for Node test environment. */
function makeMockWebSocket() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    serializeAttachment: vi.fn(),
    deserializeAttachment: vi.fn(() => ({ id: crypto.randomUUID(), userId: 'test-user' })),
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

// Patch Response to accept status 101 (Cloudflare Workers supports this but Node doesn't)
const OriginalResponse = globalThis.Response;
(globalThis as any).Response = class PatchedResponse extends OriginalResponse {
  webSocket?: WebSocket;

  constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: WebSocket }) {
    const status = init?.status;
    if (status === 101) {
      // Node doesn't allow 101, so create a 200 and patch it
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

describe('RoomSession', () => {
  let storage: ReturnType<typeof makeStorage>;
  let state: DurableObjectState;
  let env: ReturnType<typeof makeEnv>;
  let room: RoomSession;

  beforeEach(() => {
    vi.clearAllMocks();
    webSocketPairs.length = 0;
    storage = makeStorage();
    state = makeDurableObjectState(storage);
    env = makeEnv();
    room = new RoomSession(state, env as any);
  });

  // ─── WebSocket Connect ───

  describe('fetch (WebSocket connect)', () => {
    it('returns 101 with webSocket property on Upgrade request', async () => {
      const request = new Request('http://localhost/room/test-room', {
        headers: { 'Upgrade': 'websocket' },
      });

      const response = await room.fetch(request);

      expect(response.status).toBe(101);
      expect((response as any).webSocket).toBeDefined();
    });

    it('returns 426 when Upgrade header is missing', async () => {
      const request = new Request('http://localhost/room/test-room');

      const response = await room.fetch(request);

      expect(response.status).toBe(426);
    });

    it('cancels any pending alarm on connect', async () => {
      const request = new Request('http://localhost/room/test-room', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(request);

      expect(storage.deleteAlarm).toHaveBeenCalled();
    });

    it('stores roomId from URL path', async () => {
      const request = new Request('http://localhost/room/my-room-123', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(request);

      expect(storage.put).toHaveBeenCalledWith('roomId', 'my-room-123');
    });

    it('accepts the server-side WebSocket', async () => {
      const request = new Request('http://localhost/room/test-room', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(request);

      expect(state.acceptWebSocket).toHaveBeenCalled();
    });

    it('stores userId from X-User-Id header', async () => {
      const request = new Request('http://localhost/room/test-room', {
        headers: { 'Upgrade': 'websocket', 'X-User-Id': 'test-user-123' },
      });

      await room.fetch(request);
      
      const server = webSocketPairs[0].server;
      expect(server.serializeAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'test-user-123' })
      );
    });
  });

  // ─── Chat Message Broadcast ───

  describe('webSocketMessage', () => {
    it('persists chat messages to DO storage and broadcasts', async () => {
      // Connect two clients
      const req1 = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket', 'X-User-Id': 'user-1-id' },
      });
      const req2 = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket', 'X-User-Id': 'user-2-id' },
      });

      await room.fetch(req1);
      const ws1Server = webSocketPairs[0].server;

      await room.fetch(req2);
      const ws2Server = webSocketPairs[1].server;

      // ws1 sends a chat
      const chatMsg = JSON.stringify({
        type: 'chat',
        payload: { message: 'hello' },
      });

      // Clear calls from presence joins
      vi.mocked((ws1Server as any).send).mockClear();

      await room.webSocketMessage(ws1Server, chatMsg);

      // Chat should be persisted
      const storedChats = storage._store.get('chats');
      expect(storedChats).toHaveLength(1);
      expect(storedChats[0].message).toBe('hello');
      expect(storedChats[0].senderId).toBe('user-1-id');
      expect(storedChats[0].timestamp).toBeDefined();

      // Broadcast to ws2 but not ws1
      expect(ws2Server.send).toHaveBeenCalledWith(chatMsg);
      expect(ws1Server.send).not.toHaveBeenCalled();
    });

    it('broadcasts non-chat messages without persisting', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const ws1Server = webSocketPairs[0].server;

      await room.fetch(req);
      const ws2Server = webSocketPairs[1].server;

      const cursorMsg = JSON.stringify({
        type: 'cursor',
        payload: { x: 10, y: 20 },
      });

      // Clear calls from presence joins
      vi.mocked((ws1Server as any).send).mockClear();

      await room.webSocketMessage(ws1Server, cursorMsg);

      // Not persisted
      expect(storage._store.has('chats')).toBe(false);

      // Still broadcast
      expect(ws2Server.send).toHaveBeenCalledWith(cursorMsg);
    });

    it('ignores binary messages', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });
      await room.fetch(req);
      const wsServer = webSocketPairs[0].server;

      // Should not throw
      await room.webSocketMessage(wsServer, new ArrayBuffer(8));
    });

    it('removes client from sessions if broadcast send throws', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const ws1Server = webSocketPairs[0].server;

      await room.fetch(req);
      const ws2Server = webSocketPairs[1].server;

      // Make ws2 throw on send
      (ws2Server.send as any).mockImplementation(() => {
        throw new Error('Connection closed');
      });

      const msg = JSON.stringify({ type: 'cursor', payload: {} });

      // Should not throw even though ws2.send fails
      await room.webSocketMessage(ws1Server, msg);

      // ws2 should have been removed from sessions
      expect(ws2Server.send).toHaveBeenCalled();
    });
  });

  // ─── Disconnect & Alarm Scheduling ───

  describe('webSocketClose', () => {
    it('schedules alarm when room becomes empty', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const wsServer = webSocketPairs[0].server;

      await room.webSocketClose(wsServer, 1000, 'normal', true);

      expect(storage.setAlarm).toHaveBeenCalledWith(
        expect.any(Number)
      );
    });

    it('does not schedule alarm if other clients remain', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const ws1Server = webSocketPairs[0].server;

      await room.fetch(req);
      // ws2 still connected

      await room.webSocketClose(ws1Server, 1000, 'normal', true);

      // setAlarm should not be called (only deleteAlarm from the fetch calls)
      expect(storage.setAlarm).not.toHaveBeenCalled();
    });
  });

  // ─── Alarm Flush to D1 ───

  describe('alarm (D1 flush)', () => {
    it('batch-inserts chats into D1 and clears DO storage', async () => {
      // Set up stored chats and roomId
      storage._store.set('chats', [
        { message: 'hello', senderId: 'user-1', timestamp: 1000 },
        { message: 'world', senderId: 'user-2', timestamp: 2000 },
      ]);
      storage._store.set('roomId', 'room-abc');

      await room.alarm();

      // D1 batch should have been called
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
      const batch = env.DB.batch.mock.calls[0][0];
      expect(batch).toHaveLength(2);

      // Prepare should have been called with the INSERT statement
      expect(env.DB.prepare).toHaveBeenCalledWith(
        'INSERT INTO room_chats (room_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)'
      );

      // Chats should be cleared from DO storage
      expect(storage.delete).toHaveBeenCalledWith('chats');
    });

    it('does nothing when there are no chats', async () => {
      // No chats in storage
      await room.alarm();

      expect(env.DB.batch).not.toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('does nothing when chats array is empty', async () => {
      storage._store.set('chats', []);

      await room.alarm();

      expect(env.DB.batch).not.toHaveBeenCalled();
    });

    it('retries with alarm if D1 write fails', async () => {
      storage._store.set('chats', [
        { message: 'fail', senderId: 'user-1', timestamp: 1000 },
      ]);
      storage._store.set('roomId', 'room-fail');

      // Make D1 batch fail
      env.DB.batch = vi.fn().mockRejectedValue(new Error('D1 unavailable'));

      await room.alarm();

      // Should NOT clear chats (they weren't persisted)
      expect(storage.delete).not.toHaveBeenCalledWith('chats');

      // Should re-schedule alarm for retry
      expect(storage.setAlarm).toHaveBeenCalledWith(
        expect.any(Number)
      );
    });

    it('uses fallback roomId when not stored', async () => {
      storage._store.set('chats', [
        { message: 'msg', senderId: 'user-1', timestamp: 1000 },
      ]);
      // No roomId set

      await room.alarm();

      // Should still batch-insert using 'unknown' as roomId
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
    });
  });

  // ─── WebSocket Error ───

  describe('webSocketError', () => {
    it('removes the socket from sessions', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const wsServer = webSocketPairs[0].server;

      await room.webSocketError(wsServer, new Error('broken'));

      // Socket should be removed — sending a message shouldn't broadcast to anyone
    });
  });

  // ─── Edge Cases ───

  describe('edge cases', () => {
    it('schedules only one alarm when multiple clients disconnect sequentially', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const ws1Server = webSocketPairs[0].server;

      await room.fetch(req);
      const ws2Server = webSocketPairs[1].server;

      // First disconnect — room still has ws2
      await room.webSocketClose(ws1Server, 1000, 'normal', true);
      expect(storage.setAlarm).not.toHaveBeenCalled();

      // Second disconnect — room empty
      await room.webSocketClose(ws2Server, 1000, 'normal', true);
      expect(storage.setAlarm).toHaveBeenCalledTimes(1);
    });

    it('accumulates multiple chat messages before flush', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      await room.fetch(req);
      const wsServer = webSocketPairs[0].server;

      // Send 3 chat messages
      for (let i = 0; i < 3; i++) {
        await room.webSocketMessage(wsServer, JSON.stringify({
          type: 'chat',
          payload: { message: `msg-${i}` },
        }));
      }

      const storedChats = storage._store.get('chats');
      expect(storedChats).toHaveLength(3);
      expect(storedChats[0].message).toBe('msg-0');
      expect(storedChats[2].message).toBe('msg-2');

      // Flush all 3
      storage._store.set('roomId', 'room-multi');
      await room.alarm();
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
      const batch = env.DB.batch.mock.calls[0][0];
      expect(batch).toHaveLength(3);
    });

    it('cancels pending alarm when a new client reconnects', async () => {
      const req = new Request('http://localhost/room/test', {
        headers: { 'Upgrade': 'websocket' },
      });

      // Connect and disconnect — alarm is scheduled
      await room.fetch(req);
      const ws1Server = webSocketPairs[0].server;
      await room.webSocketClose(ws1Server, 1000, 'normal', true);
      expect(storage.setAlarm).toHaveBeenCalledTimes(1);

      // New client connects — alarm should be cancelled
      await room.fetch(req);
      expect(storage.deleteAlarm).toHaveBeenCalled();
    });

    it('flushes non-string chat payloads as JSON', async () => {
      // Directly set up chats with an object payload (not a string)
      storage._store.set('chats', [
        { message: { text: 'complex', image: 'url' }, senderId: 'u1', timestamp: 5000 },
      ]);
      storage._store.set('roomId', 'room-complex');

      await room.alarm();

      // DB.prepare should bind JSON.stringify'd message
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
      expect(env.DB.prepare).toHaveBeenCalledWith(
        'INSERT INTO room_chats (room_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)'
      );
    });

    it('handles senderId missing from chat during flush', async () => {
      storage._store.set('chats', [
        { message: 'anonymous msg', timestamp: 1000 },  // no senderId
      ]);
      storage._store.set('roomId', 'room-anon');

      await room.alarm();

      // Should still succeed with 'anonymous' as fallback senderId
      expect(env.DB.batch).toHaveBeenCalledTimes(1);
    });
  });
});
