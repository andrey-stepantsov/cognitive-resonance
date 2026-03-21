import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Usage: npx tsx mint_token.ts <user_email> <expiration_days>
// Example: npx tsx mint_token.ts enterprise@corp.com 30

const SECRETS_DIR = path.resolve(process.cwd(), '.keys');
const PRIVATE_KEY_PATH = path.join(SECRETS_DIR, 'ed25519.pem');
const PUBLIC_KEY_PATH = path.join(SECRETS_DIR, 'ed25519.pub');

if (!fs.existsSync(SECRETS_DIR)) {
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
}

// 1. Load or Generate the extreme-security Ed25519 Master Keypair
let privateKey: crypto.KeyObject;
let publicKey: crypto.KeyObject;

if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
  console.log('🗝️  Loading existing Master Keypair...');
  privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH));
  publicKey = crypto.createPublicKey(fs.readFileSync(PUBLIC_KEY_PATH));
} else {
  console.log('🔒 Generating new Ed25519 Master Keypair...');
  const keypair = crypto.generateKeyPairSync('ed25519');
  privateKey = keypair.privateKey;
  publicKey = keypair.publicKey;
  
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey.export({ type: 'spki', format: 'pem' }));
  
  console.log(`\n[CRITICAL] Master Private Key saved to ${PRIVATE_KEY_PATH}`);
  console.log(`[CRITICAL] DO NOT COMMIT THIS FILE TO VERSION CONTROL.\n`);
}

// 2. Parse Activation Request
const userIdentity = process.argv[2];
const daysValidStr = process.argv[3];

if (!userIdentity) {
  console.error('Usage: npx tsx mint_token.ts <user_email> [days_valid]');
  process.exit(1);
}

const nbf = Math.floor(Date.now() / 1000);

let exp: number | undefined;
const payloadObj: any = { sub: userIdentity, nbf };

if (daysValidStr) {
  const days = parseInt(daysValidStr, 10);
  if (!isNaN(days) && days > 0) {
    exp = nbf + (days * 24 * 60 * 60);
    payloadObj.exp = exp;
  }
}

// We are constructing a simple JWT-like structure without the bulky library footprint
const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');

const unsignedToken = `${header}.${payload}`;

// 3. Mathematically Sign the Token
const signature = crypto.sign(null, Buffer.from(unsignedToken), privateKey).toString('base64url');
const finalToken = `${unsignedToken}.${signature}`;

console.log('✅ Token Minted Successfully!\n');
console.log(`Identity : ${userIdentity}`);
if (exp) {
  console.log(`Expires  : ${new Date(exp * 1000).toLocaleString()}`);
} else {
  console.log(`Expires  : Never (Infinite Horizon)`);
}
console.log(`Status   : Ready for CLI /activate injection\n`);
console.log('--- BEGIN CR ACTIVATION TOKEN ---');
console.log(finalToken);
console.log('--- END CR ACTIVATION TOKEN ---\n');

console.log('Deploy the corresponding Public Key to your Cloudflare Edge worker by running:');
console.log(`npx wrangler secret put CR_PUBLIC_KEY < ${PUBLIC_KEY_PATH}`);
