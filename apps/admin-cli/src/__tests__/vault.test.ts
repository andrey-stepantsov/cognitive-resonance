import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Setup Mock Vault Dir to completely isolate the test
const TEST_VAULT = path.join(__dirname, 'test-vault');
process.env.CR_ADMIN_VAULT = TEST_VAULT;

// Import after env is set
import { saveEncryptedKey, loadDecryptedKey, hasVault } from '../vault';

describe('Admin ID Vault (AES-256-GCM)', () => {
  beforeAll(() => {
    if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  });
  
  afterAll(() => {
    if (fs.existsSync(TEST_VAULT)) fs.rmSync(TEST_VAULT, { recursive: true, force: true });
  });

  it('generates, encrypts, and successfully decrypts a private key to disk', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const privKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    
    expect(hasVault()).toBe(false);
    
    saveEncryptedKey(privKeyDer, 'super_secure_passphrase_123');
    expect(hasVault()).toBe(true);
    
    // File assertions
    const keyFile = path.join(TEST_VAULT, 'id_ed25519.enc');
    expect(fs.existsSync(keyFile)).toBe(true);
    const fileContents = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
    expect(fileContents.ciphertext).toBeDefined();
    
    const decrypted = loadDecryptedKey('super_secure_passphrase_123');
    expect(decrypted).not.toBeNull();
    expect(decrypted!.equals(privKeyDer)).toBe(true);
  });
  
  it('strictly fails decryption with an incorrect passphrase (mathematical zero-knowledge)', () => {
    const decrypted = loadDecryptedKey('wrong_passphrase');
    expect(decrypted).toBeNull();
  });
});
