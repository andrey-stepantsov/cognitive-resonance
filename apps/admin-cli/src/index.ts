import { Command } from 'commander';
import * as crypto from 'crypto';
import * as readline from 'readline/promises';
import { saveEncryptedKey, hasVault, loadDecryptedKey, saveSessionToken } from './vault';
import { encodeBase32 } from 'oslo/encoding';

const program = new Command();

program
  .name('cr-admin')
  .description('Decoupled Admin Management Engine for Cognitive Resonance')
  .version('1.0.0');

program.command('genesis')
  .description('Bootstrap the very first Superadmin identity offline')
  .option('--email <email>', 'Email for root identity (non-interactive mode)')
  .option('--passphrase <passphrase>', 'Vault passphrase (non-interactive mode)')
  .action(async (options) => {
    if (hasVault()) {
      console.error('❌ Vault already exists. You cannot run genesis twice on the same machine without wiping ~/.cr-admin/vault/');
      process.exit(1);
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('--- GENESIS BOOTSTRAP ---');
    console.log('You are creating the root identity for the Admin ecosystem.');
    
    let email = options.email;
    let passphrase = options.passphrase;
    
    if (!email) {
      email = await rl.question('Enter root administrator email: ');
      if (!email) process.exit(1);
    }
    
    if (!passphrase) {
      passphrase = await rl.question('Enter a very strong Vault Passphrase: ');
    }
    if (passphrase.length < 8) {
      console.error('Passphrase too weak. Minimum 8 characters.');
      process.exit(1);
    }
    rl.close();
    
    // 1. Generate Ed25519 Keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const privKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    
    // 2. Encrypt and Save via Vault
    saveEncryptedKey(privKeyDer, passphrase);
    
    // 3. Generate TOTP Secret (20 bytes for standard authenticator app compatibility)
    const totpSecretBytes = crypto.randomBytes(20);
    const totpSecretBase32 = encodeBase32(totpSecretBytes);
    
    // 4. Generate SQL output
    const id = `ad_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = Date.now();
    
    console.log('\n✅ Keys generated and Vault locked locally.');
    console.log('\n--- YOUR 2FA SECRET ---');
    console.log('Enter this Base32 seed into your Authenticator App (e.g., Aegis, YubiKey):');
    console.log(totpSecretBase32);
    
    console.log('\n--- BREAK GLASS SQL COMMAND ---');
    console.log('Execute this command manually against the D1 production admin database to claim the root throne:');
    
    // We sanitize linebreaks in the PEM key so bash doesn't choke when pasting it into wrangler
    const sanitizedPub = pubKeyPem.replace(/\n/g, '\\n');
    console.log(`\nnpx wrangler d1 execute admin-db --command="INSERT INTO global_admins (id, email, public_key, totp_secret, role_binding, created_at, status) VALUES ('${id}', '${email}', '${sanitizedPub}', '${totpSecretBase32}', '{""superadmin"":true}', ${timestamp}, 'active');"\n`);
    
  });

program.command('login')
  .description('Authenticate and retrieve a Zero-Trust Administrative Session')
  .option('--url <url>', 'Admin Worker endpoint URL', 'http://localhost:8787')
  .option('--passphrase <passphrase>', 'Vault passphrase (non-interactive mode)')
  .option('--totp <totp>', '6-digit Authenticator code (non-interactive mode)')
  .action(async (options) => {
    if (!hasVault()) {
      console.error('❌ Vault not found. Run `cr-admin genesis` first.');
      process.exit(1);
    }
    
    let passphrase = options.passphrase;
    let totp = options.totp;
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    if (!passphrase) {
      passphrase = await rl.question('Enter Vault Passphrase: ');
      if (!passphrase) process.exit(1);
    }
    
    const privateKeyDer = loadDecryptedKey(passphrase);
    if (!privateKeyDer) {
      console.error('❌ Invalid Passphrase or corrupted Vault.');
      process.exit(1);
    }
    
    // Derive public key
    const privKey = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
    const pubKeyObj = crypto.createPublicKey(privKey);
    const pubKeyPem = pubKeyObj.export({ type: 'spki', format: 'pem' }) as string;
    
    console.log('🔄 Fetching cryptographic challenge...');
    let challengeRes;
    try {
      challengeRes = await fetch(`${options.url}/api/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: pubKeyPem })
      });
    } catch (e: any) {
      console.error(`❌ Failed to contact Admin Worker at ${options.url}: ${e.message}`);
      process.exit(1);
    }
    
    if (!challengeRes.ok) {
      const err = await challengeRes.json().catch(() => ({}));
      console.error(`❌ Challenge failed: ${err.error || challengeRes.statusText}`);
      process.exit(1);
    }
    
    const { nonce } = await challengeRes.json() as { nonce: string };
    
    if (!totp) {
      totp = await rl.question('Enter 6-digit Authenticator Code: ');
    }
    rl.close();
    
    if (!totp || totp.length !== 6) {
      console.error('❌ Invalid TOTP format.');
      process.exit(1);
    }
    
    // Sign (nonce + totp)
    const signature = crypto.sign(null, Buffer.from(`${nonce}${totp}`, 'utf8'), privKey);
    const signatureB64 = signature.toString('base64url');
    
    console.log('🔐 Verifying Zero-Trust proofs...');
    let verifyRes;
    try {
      verifyRes = await fetch(`${options.url}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_key: pubKeyPem,
          nonce,
          totp_code: totp,
          signature: signatureB64
        })
      });
    } catch(e: any) {
      console.error(`❌ Verification request failed: ${e.message}`);
      process.exit(1);
    }
    
    const verifyData = await verifyRes.json() as any;
    if (!verifyRes.ok) {
      console.error(`❌ Authentication failed: ${verifyData.error || verifyRes.statusText}`);
      process.exit(1);
    }
    
    saveSessionToken(verifyData.token);
    
    console.log(`✅ Authentication successful. Welcome, ${verifyData.admin.email}.`);
    console.log('Session JWT secured in local vault.');
  });


program.parse();
