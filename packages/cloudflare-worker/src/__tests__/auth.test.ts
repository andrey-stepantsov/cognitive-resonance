import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signJwt, verifyJwt, generateApiKey } from '../auth';

describe('auth utilities', () => {
  describe('Password Hashing', () => {
    it('should hash a password and verify it successfully', async () => {
      const password = 'mySuperSecretPassword123!';
      const hash = await hashPassword(password);
      
      expect(hash).toContain(':');
      const parts = hash.split(':');
      expect(parts.length).toBe(2);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'mySuperSecretPassword123!';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword('wrongpassword', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Utilities', () => {
    const secret = 'test_secret_key_12345';
    
    it('should sign and verify a JWT successfully', async () => {
      const payload = { userId: 'user_123', email: 'test@example.com' };
      const token = await signJwt(payload, secret);
      
      expect(token.split('.').length).toBe(3);
      
      const decoded = await verifyJwt(token, secret);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe('user_123');
    });

    it('should fail to verify with wrong secret', async () => {
      const payload = { userId: 'user_123' };
      const token = await signJwt(payload, secret);
      
      const decoded = await verifyJwt(token, 'wrong_secret');
      expect(decoded).toBeNull();
    });
  });

  describe('API Key Generation', () => {
    it('should generate a valid API key and hash', async () => {
      const [plainKey, keyHash] = await generateApiKey();
      
      expect(plainKey.startsWith('cr_')).toBe(true);
      expect(plainKey.length).toBeGreaterThan(10);
      expect(keyHash.length).toBe(64); // SHA-256 hex is 64 chars
      
      // Generating another should be unique
      const [plainKey2, keyHash2] = await generateApiKey();
      expect(plainKey).not.toBe(plainKey2);
      expect(keyHash).not.toBe(keyHash2);
    });
  });
});
