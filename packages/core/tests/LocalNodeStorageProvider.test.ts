import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalNodeStorageProvider } from '../src/providers/LocalNodeStorageProvider';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LocalNodeStorageProvider', () => {
  let provider: LocalNodeStorageProvider;

  beforeEach(() => {
    provider = new LocalNodeStorageProvider();
    mockFetch.mockReset();
  });

  it('init() pings the server successfully', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await provider.init();
    expect(provider.isReady()).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/sessions');
  });

  it('init() fails gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    await provider.init();
    expect(provider.isReady()).toBe(false);
  });

  it('saveSession() translates to event post', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await provider.init(); // make ready
    
    await provider.saveSession('session-1', { customName: 'test' });
    
    // First call is POST to sessions
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/sessions', expect.objectContaining({ method: 'POST' }));
    
    // Second call is POST to events with snapshot
    expect(mockFetch).toHaveBeenNthCalledWith(3, 'http://localhost:3000/api/events', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('PWA_SNAPSHOT')
    }));
  });

  it('loadAllSessions() loads and maps sessions', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'sess-1' }] }); // loadAll
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [
      { type: 'PWA_SNAPSHOT', payload: '{"customName":"mapped"}', timestamp: 123 }
    ] }); // loadSession
    
    provider['ready'] = true;
    
    const sessions = await provider.loadAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('sess-1');
    expect(sessions[0].customName).toBe('mapped');
  });

  it('loadSession() respects PWA_RENAME and PWA_ARCHIVE_TOGGLE events', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [
      { type: 'PWA_SNAPSHOT', payload: '{"customName":"snap"}', timestamp: 100 },
      { type: 'PWA_RENAME', payload: '{"customName":"renamed"}', timestamp: 101 },
      { type: 'PWA_ARCHIVE_TOGGLE', payload: '{"isArchived":true}', timestamp: 102 }
    ] });
    
    provider['ready'] = true;
    const sess = await provider.loadSession('sess-1');
    expect(sess?.customName).toBe('renamed');
    expect(sess?.isArchived).toBe(true);
  });
});
