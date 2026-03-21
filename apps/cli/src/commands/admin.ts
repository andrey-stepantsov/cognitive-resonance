import { Command } from 'commander';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { backendFetch } from '../utils/api';

export function registerAdminCommands(program: Command) {
  const adminCmd = program.command('admin', { hidden: true })
    .description('Hidden super-admin commands');

  const keysCmd = adminCmd.command('keys').description('Key management');
  
  keysCmd.command('mint <userId>')
    .description('Mint a new identity token')
    .option('--expire-days <days>', 'Expiration in days')
    .action((userId, options) => {
      const vaultDir = process.env.CR_ADMIN_VAULT || path.resolve(process.cwd(), '.keys');
      const privateKeyPath = path.join(vaultDir, 'ed25519.pem');
      
      if (!fs.existsSync(privateKeyPath)) {
        console.error(`[Error] Private key not found at ${privateKeyPath}`);
        console.error('Ensure CR_ADMIN_VAULT is set properly.');
        process.exit(1);
      }

      const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
      
      const nbf = Math.floor(Date.now() / 1000);
      const payloadObj: any = { sub: userId, nbf };
      let exp: number | undefined;

      if (options.expireDays) {
        const days = parseInt(options.expireDays, 10);
        if (!isNaN(days) && days > 0) {
          exp = nbf + (days * 24 * 60 * 60);
          payloadObj.exp = exp;
        }
      }

      const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
      const unsignedToken = `${header}.${payload}`;
      const signature = crypto.sign(null, Buffer.from(unsignedToken), privateKey).toString('base64url');
      const finalToken = `${unsignedToken}.${signature}`;

      console.log('✅ Admin Token Minted\n');
      console.log(`Identity : ${userId}`);
      console.log(`Expires  : ${exp ? new Date(exp * 1000).toLocaleString() : 'Never'}`);
      console.log(`\n${finalToken}\n`);
    });

  const usersCmd = adminCmd.command('users').description('User identity management');

  usersCmd.command('revoke <userId>')
    .description('Revoke user access globally')
    .action(async (userId) => {
      try {
        const res = await backendFetch('/api/admin/users/revoke', {
          method: 'POST',
          body: JSON.stringify({ userId })
        });
        
        if (res.ok) {
          console.log(`✅ Revoked access for ${userId}`);
        } else {
          console.error(`❌ Failed to revoke: ${res.status} ${res.statusText}`);
          const text = await res.text();
          if (text) console.error(text);
          process.exit(1);
        }
      } catch (e: any) {
        console.error(`[Error] ${e.message}`);
        process.exit(1);
      }
    });

  usersCmd.command('restore <userId>')
    .description('Restore user access globally')
    .action(async (userId) => {
      try {
        const res = await backendFetch('/api/admin/users/revoke', {
          method: 'DELETE',
          body: JSON.stringify({ userId })
        });
        
        if (res.ok) {
          console.log(`✅ Restored access for ${userId}`);
        } else {
          console.error(`❌ Failed to restore: ${res.status} ${res.statusText}`);
          const text = await res.text();
          if (text) console.error(text);
          process.exit(1);
        }
      } catch (e: any) {
        console.error(`[Error] ${e.message}`);
        process.exit(1);
      }
    });
}
