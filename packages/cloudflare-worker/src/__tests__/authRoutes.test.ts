import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../index';
import crypto from 'node:crypto';

describe('E2E: Authentication Exchange Lifecycle', () => {
  let publicKeyBase64: string;
  let privateKeyObj: crypto.webcrypto.CryptoKey;
  let validToken: string;
  let expiredToken: string;
  const mockUserId = 'test-restoration-user@example.com';

  beforeEach(async () => {
    // 1. Generate an ephemeral Ed25519 keypair for the test run
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    ) as crypto.webcrypto.CryptoKeyPair;

    privateKeyObj = keyPair.privateKey;
    
    // Export Public Key to Base64 (equivalent to CR_PUBLIC_KEY)
    const pubKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    publicKeyBase64 = Buffer.from(pubKeyBuffer).toString('base64');

    // 2. Mint a VALID Permanent Identity Token
    const jwtHeader = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
    const validPayload = Buffer.from(JSON.stringify({ 
        sub: mockUserId, 
        nbf: Math.floor(Date.now() / 1000) - 60 
    })).toString('base64url');
    const validUnsigned = `${jwtHeader}.${validPayload}`;
    const validSignatureParams = { name: 'Ed25519' };
    const validSignatureData = new TextEncoder().encode(validUnsigned);
    const validSignature = await crypto.subtle.sign(validSignatureParams, privateKeyObj, validSignatureData);
    const validSigBase64Url = Buffer.from(validSignature).toString('base64url');
    validToken = `${validUnsigned}.${validSigBase64Url}`;

    // 3. Mint an EXPIRED Identity Token
    const expiredPayload = Buffer.from(JSON.stringify({ 
        sub: 'expired-user@example.com', 
        nbf: Math.floor(Date.now() / 1000) - 86400,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
    })).toString('base64url');
    const expiredUnsigned = `${jwtHeader}.${expiredPayload}`;
    const expSignatureData = new TextEncoder().encode(expiredUnsigned);
    const expSignature = await crypto.subtle.sign(validSignatureParams, privateKeyObj, expSignatureData);
    const expSigBase64Url = Buffer.from(expSignature).toString('base64url');
    expiredToken = `${expiredUnsigned}.${expSigBase64Url}`;
  });

  function makeEnv(dbMock: any) {
    return {
      DB: dbMock,
      CR_PUBLIC_KEY: publicKeyBase64,
      JWT_SECRET: 'super_secret_test_jwt_key_123456789'
    };
  }

  function makeCtx(): any { return { waitUntil: vi.fn() }; }

  it('rejects an expired identity token with 401', async () => {
    const mockDB = { prepare: vi.fn() }; // Unused, stops at crypto
    const request = new Request('http://localhost/api/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({ token: expiredToken }),
    });

    const response = await worker.fetch(request, makeEnv(mockDB), makeCtx());
    expect(response.status).toBe(401);
    const data = await response.json() as any;
    expect(data.error).toBe('Invalid Identity Token signature');
  });

  it('processes the full lifecycle: Mint -> Revoke -> Restore', async () => {
    // Stage 1: The user is NOT revoked (DB Select returns null)
    let dbState = 'ACTIVE';

    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockImplementation((userId) => {
          return {
            first: vi.fn().mockImplementation(async () => {
              if (userId !== mockUserId) return null;
              if (dbState === 'REVOKED') return { identity: mockUserId };
              return null;
            })
          }
        }),
      }),
    };

    const runExchange = async () => {
      const request = new Request('http://localhost/api/auth/exchange', {
        method: 'POST',
        body: JSON.stringify({ token: validToken }),
      });
      return await worker.fetch(request, makeEnv(mockDB), makeCtx());
    };

    // ACT 1: Token is Fresh & Active (200 OK)
    const res1 = await runExchange();
    expect(res1.status).toBe(200);
    const data1 = await res1.json() as any;
    expect(data1.token).toBeTruthy();
    expect(data1.user.id).toBe(mockUserId);

    // ACT 2: Administrator Revokes Access
    dbState = 'REVOKED';
    
    const res2 = await runExchange();
    expect(res2.status).toBe(403);
    const data2 = await res2.json() as any;
    expect(data2.error).toBe('Identity access revoked');

    // ACT 3: Administrator Restores Access (Deletes DB Row)
    dbState = 'RESTORED'; // Acts identical to ACTIVE
    
    const res3 = await runExchange();
    expect(res3.status).toBe(200);
    const data3 = await res3.json() as any;
    expect(data3.token).toBeTruthy();
  });

  it('rejects /api/auth/exchange missing token', async () => {
    const request = new Request('http://localhost/api/auth/exchange', {
      method: 'POST', body: JSON.stringify({}),
    });
    const response = await worker.fetch(request, makeEnv({}), makeCtx());
    expect(response.status).toBe(400);
  });

  it('rejects /api/auth/exchange when strictly unconfigured', async () => {
    const request = new Request('http://localhost/api/auth/exchange', {
      method: 'POST', body: JSON.stringify({ token: validToken }),
    });
    // Omit JWT_SECRET
    const env = makeEnv({});
    env.JWT_SECRET = '';
    const response = await worker.fetch(request, env, makeCtx());
    expect(response.status).toBe(500);
  });

  it('handles /api/auth/invite generating an invite token', async () => {
    const mockDB = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }) };
    const request = new Request('http://localhost/api/auth/invite', {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({ sessionId: 'test-room-id' }),
    });
    const response = await worker.fetch(request, makeEnv(mockDB), makeCtx());
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.token).toBeTruthy();
  });

  it('rejects /api/auth/invite with missing sessionId', async () => {
    const mockDB = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }) };
    const request = new Request('http://localhost/api/auth/invite', {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({}),
    });
    const response = await worker.fetch(request, makeEnv(mockDB), makeCtx());
    expect(response.status).toBe(400);
  });
});
