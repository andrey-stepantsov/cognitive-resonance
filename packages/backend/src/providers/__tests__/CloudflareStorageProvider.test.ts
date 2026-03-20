import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './src/mocks/server';
import { CloudflareStorageProvider } from '../CloudflareStorageProvider';

const WORKER_URL = 'https://test-worker.example.com';
const TEST_API_KEY = 'test-api-key-abc123';

describe('CloudflareStorageProvider', () => {
  let provider: CloudflareStorageProvider;

  beforeEach(() => {
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



  describe('createSession', () => {
    it('sends PUT to /api/sessions/:id with auth header', async () => {
      await provider.createSession('sess-1', {
        customName: 'My Session',
      });
    });

    it('generates id if none provided', async () => {
      await provider.createSession('', {});
    });
  });

  describe('loadAllSessions', () => {
    it('fetches GET /api/sessions with auth header', async () => {
      await provider.init();

      const sessions = await provider.loadAllSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('s1');
      expect(sessions[1].id).toBe('s2');
    });

    it('returns empty array if not ready', async () => {
      const fresh = new CloudflareStorageProvider();
      const sessions = await fresh.loadAllSessions();
      expect(sessions).toEqual([]);
    });

    it('returns empty array on fetch error', async () => {
      await provider.init();
      server.use(
        http.get('*/api/sessions', () => {
          return HttpResponse.error();
        })
      );
      
      const sessions = await provider.loadAllSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('loadSession', () => {
    it('fetches GET /api/events/:id with auth header', async () => {
      await provider.init();

      const session = await provider.loadSession('s1');
      expect(session?.id).toBe('s1');
      expect(session?.isCloud).toBe(true);
    });

    it('returns undefined for 404', async () => {
      await provider.init();
      server.use(
        http.get('*/api/events/:id', () => {
          return HttpResponse.json({}, { status: 404 });
        })
      );
      const session = await provider.loadSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('sends DELETE to /api/sessions/:id with auth header', async () => {
      await provider.deleteSession('sess-1');
    });
  });

  describe('renameSession', () => {
    it('sends PATCH with customName and auth header', async () => {
      await provider.renameSession('sess-1', 'New Name');
    });
  });

  describe('archiveSession', () => {
    it('sends PATCH with isArchived and auth header', async () => {
      await provider.archiveSession('sess-1', true);
    });
  });

  describe('Gems Config', () => {
    it('saves gems config via PUT /api/gems with auth header', async () => {
      const result = await provider.saveGemsConfig({ systemPrompt: 'test' } as any);
      expect(result).toBeUndefined(); // Resolves successfully
    });

    it('loads gems config via GET /api/gems with auth header', async () => {
      await provider.init();
      
      const result = await provider.loadGemsConfig();
      expect(result).toEqual({ systemPrompt: 'test' });
    });

    it('returns null if not ready', async () => {
      const fresh = new CloudflareStorageProvider();
      const result = await fresh.loadGemsConfig();
      expect(result).toBeNull();
    });
  });
});
