import { describe, it, expect, vi } from 'vitest';
import app from '../index';

describe('Admin Worker E2E / Auth Router', () => {
  const MOCK_ENV = {
    DB_ADMIN: {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'ad_123', status: 'active', totp_secret: 'MOCK_SECRET_BASE32' })
    },
    JWT_SECRET: 'test_secret_for_challenge_signatures'
  };

  it('returns healthy status on /health without auth', async () => {
    const res = await app.request('/health', {}, MOCK_ENV as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('healthy');
    expect(data.admin_db).toBe('ok');
  });

  it('rejects /api/auth/challenge if public_key is entirely missing', async () => {
    const res = await app.request('/api/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({})
    }, MOCK_ENV as any);
    expect(res.status).toBe(400);
  });
  
  it('issues a stateless cryptographic JWT challenge nonce for a valid public key', async () => {
    const res = await app.request('/api/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ public_key: 'mock_pub_key_ed25519' })
    }, MOCK_ENV as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.nonce).toBeDefined(); // This is the JWT
    expect(data.expires_at).toBeGreaterThan(Date.now());
  });
  
  it('rejects /api/auth/verify if cryptographic proofs are missing', async () => {
     const res = await app.request('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ public_key: 'mock' }) // Missing nonce, totp, sig
    }, MOCK_ENV as any);
    expect(res.status).toBe(400);
  });
});
