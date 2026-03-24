import { describe, it, expect, vi } from 'vitest';
import app from '../index';
import { signJwt } from '../auth';

describe('Admin Worker E2E / Environments Router', () => {
  const SECRET = 'test_secret_for_env_auth';
  
  const getMockEnv = (dbRows: any[] = []) => ({
    DB_ADMIN: {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(dbRows[0]),
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn().mockResolvedValue({ results: dbRows })
    },
    JWT_SECRET: SECRET
  });

  it('rejects environment provisioning if no token is provided', async () => {
    const res = await app.request('/api/environments', {
      method: 'POST',
      body: JSON.stringify({ name: 'qa-1', type: 'qa' })
    }, getMockEnv() as any);
    
    expect(res.status).toBe(401);
  });

  it('rejects environment provisioning if the JWT role lacks superadmin/env_admin', async () => {
    const token = await signJwt({ type: 'session', role_binding: '{"auditor":true}' }, SECRET);
    
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'qa-1', type: 'qa' })
    }, getMockEnv() as any);
    
    expect(res.status).toBe(403);
  });

  it('provisions a new environment successfully for a superadmin', async () => {
    const token = await signJwt({ type: 'session', role_binding: '{"superadmin":true}', id: 'ad_1' }, SECRET);
    const mockEnv = getMockEnv();
    
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'staging-env', type: 'staging' })
    }, mockEnv as any);
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('provisioning');
    expect(data.environment.name).toBe('staging-env');
    expect(mockEnv.DB_ADMIN.run).toHaveBeenCalledTimes(2); // CREATE TABLE + INSERT
  });

  it('lists existing environments', async () => {
    const token = await signJwt({ type: 'session', role_binding: '{"env_admin":true}' }, SECRET);
    const mockEnv = getMockEnv([{ name: 'prod-1', status: 'provisioning' }]);
    
    const res = await app.request('/api/environments', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, mockEnv as any);
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.environments.length).toBe(1);
    expect(data.environments[0].name).toBe('prod-1');
  });

  it('destroys an environment by name', async () => {
    const token = await signJwt({ type: 'session', role_binding: '{"superadmin":true}' }, SECRET);
    
    const res = await app.request('/api/environments/dev-sandbox', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }, getMockEnv() as any);
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('destroyed');
    expect(data.environment).toBe('dev-sandbox');
  });

  it('safely catches and returns 500 errors if the DB fails unexpectedly', async () => {
    const token = await signJwt({ type: 'session', role_binding: '{"superadmin":true}' }, SECRET);
    const mockEnv = getMockEnv();
    mockEnv.DB_ADMIN.run = vi.fn().mockRejectedValue(new Error('Syntax error on table environments'));
    
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'qa-fail', type: 'qa' })
    }, mockEnv as any);
    
    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toBe('Syntax error on table environments');
  });
});
