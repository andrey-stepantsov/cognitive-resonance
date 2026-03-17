import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMultiplayerSync } from '../hooks/useMultiplayerSync';

class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;

  constructor(url: string) {
    this.url = url;
    this.send = vi.fn();
    this.close = vi.fn();
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];
  static OPEN = 1;
}

describe('useMultiplayerSync', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes connection based on options', () => {
    renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'session-123' })
    );

    expect(MockWebSocket.instances.length).toBe(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('wss://api.example.com/room/session-123');
  });

  it('appends token to URL if provided', () => {
    renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess', token: 'jwt-token-123' })
    );

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('wss://api.example.com/room/sess?token=jwt-token-123');
  });

  it('uses ws:// protocol for localhost', () => {
    renderHook(() =>
      useMultiplayerSync({ workerUrl: 'localhost:8787', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://localhost:8787/room/sess');
  });

  it('handles successful connection and ping interval', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    expect(result.current.isConnected).toBe(false);

    act(() => {
      ws.readyState = MockWebSocket.OPEN;
      if (ws.onopen) ws.onopen();
    });

    expect(result.current.isConnected).toBe(true);

    // Fast-forward 30s to trigger ping
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
  });

  it('receives and processes incoming chat messages', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'chat',
            payload: { content: 'hello from server' },
            senderId: 'user-2',
            timestamp: 1234
          }),
        });
      }
    });

    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0].payload.content).toBe('hello from server');
  });

  it('receives and processes incoming cursor updates', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            payload: { x: 100, y: 200 },
            senderId: 'user-2'
          }),
        });
      }
    });

    expect(result.current.cursors).toEqual({ 'user-2': { x: 100, y: 200 } });
  });

  it('receives and processes webrtc-signals via onSignal callback', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    const signalCallback = vi.fn();
    
    act(() => {
      result.current.onSignal(signalCallback);
    });

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'webrtc-signal',
            payload: { signalData: { sdp: 'fake-sdp' }, targetUserId: 'user-1' },
            senderId: 'user-2'
          }),
        });
      }
    });

    expect(signalCallback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'webrtc-signal',
      payload: { signalData: { sdp: 'fake-sdp' }, targetUserId: 'user-1' },
      senderId: 'user-2'
    }));
  });

  it('sends outgoing chat message and optimistically updates UI', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.OPEN;

    act(() => {
      result.current.sendChatMessage('my own message');
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'chat', payload: { content: 'my own message' } })
    );

    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0].payload.content).toBe('my own message');
    expect(result.current.messages[0].senderId).toBe('me');
  });

  it('sends outgoing cursor positions', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.OPEN;

    act(() => {
      result.current.sendCursor(50, 60);
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'cursor', payload: { x: 50, y: 60 } })
    );
  });

  it('sends outgoing webrtc-signals', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.OPEN;

    act(() => {
      result.current.sendSignal('target-123', { candidate: 'fake-candidate' });
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'webrtc-signal', payload: { targetUserId: 'target-123', signalData: { candidate: 'fake-candidate' } } })
    );
  });

  it('reconnects after connection is closed intentionally or error', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws1 = MockWebSocket.instances[0];
    
    act(() => {
      if (ws1.onopen) ws1.onopen();
    });
    
    expect(result.current.isConnected).toBe(true);
    
    // Trigger close
    act(() => {
      if (ws1.onclose) ws1.onclose();
    });
    
    expect(result.current.isConnected).toBe(false);

    // Fast-forward 3000ms backoff
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Should have created a new WebSocket
    expect(MockWebSocket.instances.length).toBe(2);
    const ws2 = MockWebSocket.instances[1];
    expect(ws2.url).toBe('wss://api.example.com/room/sess');
  });

  it('cleans up on unmount securely without reconnecting', () => {
    const { unmount } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    
    unmount();
    
    expect(ws.onclose).toBeNull(); // Reconnect handler removed
    expect(ws.close).toHaveBeenCalled();

    // Fast-forward
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should not have attempted reconnect
    expect(MockWebSocket.instances.length).toBe(1);
  });
  it('receives and processes incoming rtc messages', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'rtc',
            payload: { sdp: 'fake-sdp' },
            senderId: 'user-3'
          }),
        });
      }
    });

    expect(result.current.messages.length).toBe(1);
    expect(result.current.messages[0].type).toBe('rtc');
  });

  it('handles presence sync action', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'presence',
            payload: {
              action: 'sync',
              users: [{ sessionId: 's1', userId: 'u1' }, { sessionId: 's2', userId: 'u2' }],
              yourSessionId: 'my-session-id'
            }
          }),
        });
      }
    });

    expect(result.current.localSessionId).toBe('my-session-id');
    expect(result.current.activeUsers['s1']).toEqual({ sessionId: 's1', userId: 'u1' });
    expect(result.current.activeUsers['s2']).toEqual({ sessionId: 's2', userId: 'u2' });
  });

  it('handles presence join and leave actions', () => {
    const { result } = renderHook(() =>
      useMultiplayerSync({ workerUrl: 'api.example.com', sessionId: 'sess' })
    );

    const ws = MockWebSocket.instances[0];
    
    // Join
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'presence',
            payload: {
              action: 'join',
              sessionId: 's3',
              userId: 'u3'
            }
          }),
        });
      }
    });

    expect(result.current.activeUsers['s3']).toEqual({ sessionId: 's3', userId: 'u3' });

    // Leave
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: 'presence',
            payload: {
              action: 'leave',
              sessionId: 's3'
            }
          }),
        });
      }
    });

    expect(result.current.activeUsers['s3']).toBeUndefined();
  });
});
