import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudflareStorageProvider } from '../CloudflareStorageProvider';

const WORKER_URL = 'https://test-worker.example.com';
const TEST_API_KEY = 'test-api-key-abc123';

describe('CloudflareStorageProvider', () => {
  let provider: CloudflareStorageProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new CloudflareStorageProvider();
    provider.configure(WORKER_URL, TEST_API_KEY);
  });

  it('reports type as cloud', () => {
    expect(provider.type).toBe('cloud');
  });

  it('is not ready before init', () => {
    const fresh = new CloudflareStorageProvider();
    expect(fresh.isReady()).toBe(false);
  });

  it('is ready after configure + init', async () => {
    await provider.init();
    expect(provider.isReady()).toBe(true);
  });

  it('is not ready if no URL configured', async () => {
    const fresh = new CloudflareStorageProvider();
    await fresh.init();
    expect(fresh.isReady()).toBe(false);
  });

  function expectAuthHeader(mockFetch: ReturnType<typeof vi.fn>) {
    const callArgs = mockFetch.mock.calls[0];
    const opts = callArgs[1] as RequestInit;
    const headers = opts?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
  }

  describe('saveSession', () => {
    it('sends PUT to /api/sessions/:id with auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ id: 'sess-1', ok: true }) });
      vi.stubGlobal('fetch', mockFetch);

      const id = await provider.saveSession('sess-1', {
        messages: [{ content: 'Hello world!' }],
        customName: 'My Session',
      });

      expect(id).toBe('sess-1');
      expect(mockFetch).toHaveBeenCalledWith(
        `${WORKER_URL}/api/sessions/sess-1`,
        expect.objectContaining({ method: 'PUT' })
      );
      expectAuthHeader(mockFetch);
    });

    it('generates id if none provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const id = await provider.saveSession('', { messages: [] });
      expect(id).toMatch(/^session-/);
    });
  });

  describe('loadAllSessions', () => {
    it('fetches GET /api/sessions with auth header', async () => {
      await provider.init();
      const mockRows = [
        { id: 's1', timestamp: 1000, preview: 'Hello...', customName: null, config: '{}', isArchived: false },
        { id: 's2', timestamp: 2000, preview: 'World...', customName: 'Named', config: '{}', isArchived: true },
      ];
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => mockRows });
      vi.stubGlobal('fetch', mockFetch);

      const sessions = await provider.loadAllSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('s1');
      expect(sessions[1].customName).toBe('Named');
      expect(sessions[1].isArchived).toBe(true);
      expectAuthHeader(mockFetch);
    });

    it('returns empty array if not ready', async () => {
      const fresh = new CloudflareStorageProvider();
      const sessions = await fresh.loadAllSessions();
      expect(sessions).toEqual([]);
    });

    it('returns empty array on fetch error', async () => {
      await provider.init();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const sessions = await provider.loadAllSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('loadSession', () => {
    it('fetches GET /api/sessions/:id with auth header', async () => {
      await provider.init();
      const mockRow = { id: 's1', timestamp: 1000, preview: 'Hello...', config: '{}', data: '{"messages":[]}' };
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => mockRow });
      vi.stubGlobal('fetch', mockFetch);

      const session = await provider.loadSession('s1');
      expect(session?.id).toBe('s1');
      expect(session?.isCloud).toBe(true);
      expectAuthHeader(mockFetch);
    });

    it('returns undefined for 404', async () => {
      await provider.init();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      const session = await provider.loadSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('sends DELETE to /api/sessions/:id with auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await provider.deleteSession('sess-1');
      expect(mockFetch).toHaveBeenCalledWith(
        `${WORKER_URL}/api/sessions/sess-1`,
        expect.objectContaining({ method: 'DELETE' })
      );
      expectAuthHeader(mockFetch);
    });
  });

  describe('renameSession', () => {
    it('sends PATCH with customName and auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await provider.renameSession('sess-1', 'New Name');
      expect(mockFetch).toHaveBeenCalledWith(
        `${WORKER_URL}/api/sessions/sess-1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ customName: 'New Name' }),
        })
      );
      expectAuthHeader(mockFetch);
    });
  });

  describe('archiveSession', () => {
    it('sends PATCH with isArchived and auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await provider.archiveSession('sess-1', true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${WORKER_URL}/api/sessions/sess-1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isArchived: true }),
        })
      );
      expectAuthHeader(mockFetch);
    });
  });

  describe('Gems Config', () => {
    it('saves gems config via PUT /api/gems with auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await provider.saveGemsConfig({ systemPrompt: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        `${WORKER_URL}/api/gems`,
        expect.objectContaining({ method: 'PUT' })
      );
      expectAuthHeader(mockFetch);
    });

    it('loads gems config via GET /api/gems with auth header', async () => {
      await provider.init();
      const config = { systemPrompt: 'test' };
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => config });
      vi.stubGlobal('fetch', mockFetch);

      const result = await provider.loadGemsConfig();
      expect(result).toEqual(config);
      expectAuthHeader(mockFetch);
    });

    it('returns null if not ready', async () => {
      const fresh = new CloudflareStorageProvider();
      const result = await fresh.loadGemsConfig();
      expect(result).toBeNull();
    });
  });
});
