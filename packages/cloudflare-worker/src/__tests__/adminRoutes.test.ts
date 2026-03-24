import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../index';

describe('E2E: Edge Super-Admin Proxy', () => {
  const TEST_API_KEY = 'super_secret_test_api_key_123';
  const MOCK_USER_ID = 'test-revoked-user@example.com';

  function makeEnv(dbMock: any, superAdminIds?: string) {
    return {
      DB: dbMock,
      API_KEY: TEST_API_KEY,
      SECRET_SUPER_ADMIN_IDS: superAdminIds,
    };
  }

  function makeCtx(): any { return { waitUntil: vi.fn() }; }

  it('rejects an authorized standard user with 403 when trying to access admin routes', async () => {
    const mockDB = { prepare: vi.fn() }; 
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    // The token resolves to userId: 'default', but 'default' is not in the super admin list
    const response = await worker.fetch(request, makeEnv(mockDB, undefined), makeCtx());
    expect(response.status).toBe(403);
    const data = await response.json() as any;
    expect(data.error).toBe('Super Admin disabled');
  });

  it('rejects an authorized standard user even if a super admin list exists', async () => {
    const mockDB = { prepare: vi.fn() }; 
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    // Valid user is 'default', valid admins are 'admin1,admin2'
    const response = await worker.fetch(request, makeEnv(mockDB, '[\"admin1\",\"admin2\"]'), makeCtx());
    expect(response.status).toBe(403);
    const data = await response.json() as any;
    expect(data.error).toBe('Forbidden: Super Admin only');
  });

  it('allows a Super Admin to successfully revoke a user identity', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    let dbQuery = '';
    let dbBinds: any[] = [];

    const mockDB = {
      prepare: vi.fn().mockImplementation((query) => {
        dbQuery = query;
        return {
          bind: vi.fn().mockImplementation((...args) => {
            dbBinds = args;
            return {
              run: runMock
            };
          })
        };
      })
    };

    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY }, // Resolves to 'default'
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    // Assign 'default' super admin powers
    const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
    
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.ok).toBe(true);

    expect(dbQuery).toContain('INSERT INTO revoked_identities');
    expect(dbBinds).toContain(MOCK_USER_ID);
    expect(runMock).toHaveBeenCalled();
  });

  it('allows a Super Admin to successfully restore a user identity', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    let dbQuery = '';
    let dbBinds: any[] = [];

    const mockDB = {
      prepare: vi.fn().mockImplementation((query) => {
        dbQuery = query;
        return {
          bind: vi.fn().mockImplementation((...args) => {
            dbBinds = args;
            return {
              run: runMock
            };
          })
        };
      })
    };

    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'DELETE',
      headers: { 'x-api-key': TEST_API_KEY }, // Resolves to 'default'
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    // Assign 'default' super admin powers
    const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
    
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.ok).toBe(true);

    expect(dbQuery).toContain('DELETE FROM revoked_identities WHERE identity = ?');
    expect(dbBinds).toContain(MOCK_USER_ID);
    expect(runMock).toHaveBeenCalled();
  });

  it('supports comma-separated super admin lists instead of JSON', async () => {
    const mockDB = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue({}) }))
      }))
    };
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    // Pass invalid JSON so it falls back to comma-separated string
    const response = await worker.fetch(request, makeEnv(mockDB, 'default, other_admin'), makeCtx());
    expect(response.status).toBe(200);
  });

  it('handles database errors during POST revoke gracefully', async () => {
    const mockDB = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockImplementation(() => ({ 
           run: vi.fn().mockRejectedValue(new Error('Generic failure')) 
        }))
      }))
    };
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
    expect(response.status).toBe(500);
    const data = await response.json() as any;
    expect(data.error).toBe('Database error');
  });

  it('handles database errors during DELETE restore gracefully', async () => {
    const mockDB = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockImplementation(() => ({ 
           run: vi.fn().mockRejectedValue(new Error('Generic failure')) 
        }))
      }))
    };
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'DELETE',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ userId: MOCK_USER_ID }),
    });

    const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
    expect(response.status).toBe(500);
    const data = await response.json() as any;
    expect(data.error).toBe('Database error');
  });

  it('rejects POST revoke with missing userId', async () => {
    const mockDB = { prepare: vi.fn() };
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ }),
    });

    const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
    expect(response.status).toBe(400);
  });

  it('rejects DELETE restore with missing userId', async () => {
    const mockDB = { prepare: vi.fn() };
    const request = new Request('http://localhost/api/admin/users/revoke', {
      method: 'DELETE',
      headers: { 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ }),
    });

    const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
    expect(response.status).toBe(400);
  });

  describe('Health and System Endpoints', () => {
    it('returns healthy status when DB and AI are available', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          first: vi.fn().mockResolvedValue({ 1: 1 })
        }))
      };
      
      const envWithAI = { ...makeEnv(mockDB, '[\"default\"]'), AI: {} };
      const request = new Request('http://localhost/api/admin/health', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
  
      const response = await worker.fetch(request, envWithAI, makeCtx());
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.status).toBe('healthy');
      expect(data.components.database).toBe('ok');
      expect(data.components.ai_binding).toBe('ok');
    });

    it('returns unhealthy status when DB fails', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          first: vi.fn().mockRejectedValue(new Error('DB Offline'))
        }))
      };
      
      const request = new Request('http://localhost/api/admin/health', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
  
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(500);
      const data = await response.json() as any;
      expect(data.status).toBe('unhealthy');
      expect(data.error).toBe('DB Offline');
    });
  });

  describe('Sandboxes Endpoint', () => {
    it('returns active sandboxes correctly', async () => {
       const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          all: vi.fn().mockResolvedValue({ results: [{ id: '123', user_id: 'abc', estimated_tokens: 100, timestamp: 1234 }] })
        }))
      };
      const request = new Request('http://localhost/api/admin/sandboxes', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.sessions[0].id).toBe('123');
    });

    it('handles sandbox DB errors', async () => {
       const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          all: vi.fn().mockRejectedValue(new Error('fail'))
        }))
      };
      const request = new Request('http://localhost/api/admin/sandboxes', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(500);
    });
  });

  describe('Bot and User Registration Endpoints', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') } as any);
    });

    it('registers a bot token', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue({}) }))
        }))
      };
      const request = new Request('http://localhost/api/admin/bot/register', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ userId: 'abc', botToken: '123:abc' })
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.ok).toBe(true);
    });

    it('rejects bot registration without parameters', async () => {
      const mockDB = { prepare: vi.fn() };
      const request = new Request('http://localhost/api/admin/bot/register', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({})
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(400);
    });

    it('handles bot registration DB errors', async () => {
       const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation(() => ({ run: vi.fn().mockRejectedValue(new Error('fail')) }))
        }))
      };
      const request = new Request('http://localhost/api/admin/bot/register', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ userId: 'abc', botToken: '123:abc' })
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(500);
    });

    it('links a telegram user', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue({}) }))
        }))
      };
      const request = new Request('http://localhost/api/admin/users/telegram-link', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ userId: 'abc', tgUserId: '123456' })
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(200);
    });

    it('rejects telegram link without parameters', async () => {
      const mockDB = { prepare: vi.fn() };
      const request = new Request('http://localhost/api/admin/users/telegram-link', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({})
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(400);
    });

    it('handles telegram link DB errors', async () => {
       const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation(() => ({ run: vi.fn().mockRejectedValue(new Error('fail')) }))
        }))
      };
      const request = new Request('http://localhost/api/admin/users/telegram-link', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
        body: JSON.stringify({ userId: 'abc', tgUserId: '123' })
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(500);
    });
  });
  describe('Admin Issues API', () => {
    it('returns a list of issues', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          all: vi.fn().mockResolvedValue({ results: [{ id: 'issue-1', title: 'bug' }] })
        }))
      };
      const request = new Request('http://localhost/api/admin/issues', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.issues).toHaveLength(1);
    });

    it('returns a specific issue by ID', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation(() => ({
            first: vi.fn().mockResolvedValue({ id: 'issue-1', title: 'bug' })
          }))
        }))
      };
      const request = new Request('http://localhost/api/admin/issues/issue-1', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.issue.id).toBe('issue-1');
    });

    it('resolves an issue', async () => {
      const runMock = vi.fn().mockResolvedValue({});
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockImplementation(() => ({ run: runMock }))
        }))
      };
      const request = new Request('http://localhost/api/admin/issues/issue-1/resolve', {
        method: 'POST',
        headers: { 'x-api-key': TEST_API_KEY },
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.ok).toBe(true);
      expect(runMock).toHaveBeenCalled();
    });

    it('handles database errors gracefully for issues', async () => {
      const mockDB = {
        prepare: vi.fn().mockImplementation(() => ({
          all: vi.fn().mockRejectedValue(new Error('fail'))
        }))
      };
      const request = new Request('http://localhost/api/admin/issues', {
        method: 'GET',
        headers: { 'x-api-key': TEST_API_KEY },
      });
      const response = await worker.fetch(request, makeEnv(mockDB, '[\"default\"]'), makeCtx());
      expect(response.status).toBe(500);
    });
  });
});
