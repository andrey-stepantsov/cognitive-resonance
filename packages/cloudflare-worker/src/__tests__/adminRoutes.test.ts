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
});
