import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function getVaultDir() {
  return process.env.CR_ADMIN_VAULT || path.join(require('os').homedir(), '.cr-admin', 'vault');
}

export function hasVault(): boolean {
  return fs.existsSync(path.join(getVaultDir(), 'id_ed25519.enc'));
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32);
}

export function saveEncryptedKey(privateKeyDer: Buffer, passphrase: string) {
  const dir = getVaultDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(privateKeyDer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  const payload = JSON.stringify({
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  }, null, 2);
  
  // Ensure strict file permissions for the key file (read/write only by owner)
  fs.writeFileSync(path.join(getVaultDir(), 'id_ed25519.enc'), payload, { mode: 0o600 });
}

export function loadDecryptedKey(passphrase: string): Buffer | null {
  const keyFile = path.join(getVaultDir(), 'id_ed25519.enc');
  if (!fs.existsSync(keyFile)) return null;
  
  let payload: any;
  try {
    payload = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
  } catch (e) {
    return null;
  }
  
  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  try {
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
  } catch (err) {
    return null; // Invalid passphrase
  }
}

export function saveSessionToken(token: string) {
  const dir = getVaultDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'session.jwt'), token, { mode: 0o600 });
}

export function loadSessionToken(): string | null {
  const file = path.join(getVaultDir(), 'session.jwt');
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf-8');
}
