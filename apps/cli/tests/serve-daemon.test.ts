import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSyncDaemon } from '../src/commands/serve';

describe('runSyncDaemon', () => {
  let mockDbEngine: any;
  let mockClients: Set<any>;
  let mockLogger: any;

  beforeEach(() => {
    mockDbEngine = {
      getPendingEvents: vi.fn(),
      getLatestEventTimestamp: vi.fn(),
      markEventsSynced: vi.fn(),
      insertRemoteEvent: vi.fn(),
    };
    mockClients = new Set();
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    
    global.fetch = vi.fn() as any;
    global.Headers = class { set() {} } as any;
    vi.spyOn(global.crypto, 'randomUUID').mockReturnValue('1234-5678');
  });

  it('runs push phase for pending events and handles success', async () => {
    mockDbEngine.getPendingEvents.mockReturnValue([{ id: '1' }]);
    mockDbEngine.getLatestEventTimestamp.mockReturnValue(0);
    
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] })
    });
    global.fetch = mockFetch as any;

    await runSyncDaemon(mockDbEngine, mockClients, mockLogger);

    expect(mockFetch).toHaveBeenCalledTimes(2); // push and pull
    expect(mockDbEngine.markEventsSynced).toHaveBeenCalledWith(['1']);
  });

  it('runs push phase and handles fetch failure', async () => {
    mockDbEngine.getPendingEvents.mockReturnValue([{ id: '1' }]);
    mockDbEngine.getLatestEventTimestamp.mockReturnValue(0);
    
    const mockFetch = vi.fn().mockImplementation((url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/batch')) return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' });
      return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
    });
    global.fetch = mockFetch as any;

    const origRandom = Math.random;
    Math.random = () => 0.01;

    await runSyncDaemon(mockDbEngine, mockClients, mockLogger);
    
    Math.random = origRandom;
    // debugging if needed: console.log(mockLogger.error.mock.calls);

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Edge Push Failed: 500 Server Error'));
    expect(mockDbEngine.markEventsSynced).not.toHaveBeenCalled();
  });

  it('runs pull phase and syncs new events to websocket clients', async () => {
    mockDbEngine.getPendingEvents.mockReturnValue([]);
    mockDbEngine.getLatestEventTimestamp.mockReturnValue(100);
    
    const incomingEvent = {
        id: 'evt-incoming',
        session_id: 'test-session',
        timestamp: 100,
        actor: 'Edge Node',
        type: 'CHAT_MESSAGE',
        payload: JSON.stringify({ message: { role: 'model', content: 'test msg' } }),
        previous_event_id: null
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [incomingEvent] })
    });
    global.fetch = mockFetch as any;

    const mockWs = { readyState: 1 /* OPEN */, send: vi.fn() };
    mockClients.add(mockWs);

    await runSyncDaemon(mockDbEngine, mockClients, mockLogger);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockDbEngine.insertRemoteEvent).toHaveBeenCalledWith(incomingEvent);
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'event', event: incomingEvent }));
  });

  it('handles pull phase failure', async () => {
    mockDbEngine.getPendingEvents.mockReturnValue([]);
    mockDbEngine.getLatestEventTimestamp.mockReturnValue(0);
    
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });
    global.fetch = mockFetch as any;

    // We stub Math.random to guarantee it enters the 5% error logging block
    const origRandom = Math.random;
    Math.random = () => 0.01;

    await runSyncDaemon(mockDbEngine, mockClients, mockLogger);
    Math.random = origRandom;

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Edge Pull Failed: 404'));
  });

  it('catches generic errors', async () => {
    mockDbEngine.getPendingEvents.mockImplementation(() => { throw new Error('DB Error'); });
    
    const origRandom = Math.random;
    Math.random = () => 0.01;

    await runSyncDaemon(mockDbEngine, mockClients, mockLogger);
    Math.random = origRandom;

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Offline or unreachable: DB Error'));
  });
});
