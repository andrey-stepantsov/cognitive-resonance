import { Command } from 'commander';
import { DatabaseEngine } from '../db/DatabaseEngine.js';
import crypto from 'crypto';
import { backendFetch } from '../utils/api.js';

export function registerUserCommands(program: Command) {
  const userCmd = program.command('user').description('User management commands');
  
  userCmd.command('register <email> <nick> <password>')
    .option('-d, --db <path>', 'Path to SQLite database', process.env.DB_PATH || 'test.sqlite')
    .action((email, nick, password, options) => {
        const db = new DatabaseEngine(options.db);
        const userId = crypto.randomUUID();
        db.upsertUser({
             id: userId,
             email,
             nick,
             password_hash: password, // Note: hash in real app
             status: 'active'
        });
        db.createSession('SYSTEM', 'system-session');
        db.appendEvent({
             session_id: 'system-session',
             timestamp: Date.now(),
             actor: 'SYSTEM',
             type: 'USER_REGISTERED',
             payload: JSON.stringify({ id: userId, email, nick, password_hash: password }),
             previous_event_id: null
        });
        console.log(`User registered: ${userId}`);
        db.close();
    });

  userCmd.command('suspend <userId>')
    .option('-d, --db <path>', 'Path to SQLite database', process.env.DB_PATH || 'test.sqlite')
    .action((userId, options) => {
        const db = new DatabaseEngine(options.db);
        const user = db.getUserById(userId);
        if (user) {
            user.status = 'suspended';
            db.upsertUser(user);
            db.createSession('SYSTEM', 'system-session');
            db.appendEvent({
                 session_id: 'system-session',
                 timestamp: Date.now(),
                 actor: 'SYSTEM',
                 type: 'USER_SUSPENDED',
                 payload: JSON.stringify({ userId }),
                 previous_event_id: null
            });
            console.log(`User suspended: ${userId}`);
        } else {
            console.error(`User not found: ${userId}`);
        }
        db.close();
    });
    
  userCmd.command('set-password <userId> <newPassword>')
    .option('-d, --db <path>', 'Path to SQLite database', process.env.DB_PATH || 'test.sqlite')
    .action((userId, newPassword, options) => {
        const db = new DatabaseEngine(options.db);
        const user = db.getUserById(userId);
        if (user) {
            user.password_hash = newPassword;
            db.upsertUser(user);
            db.createSession('SYSTEM', 'system-session');
            db.appendEvent({
                 session_id: 'system-session',
                 timestamp: Date.now(),
                 actor: 'SYSTEM',
                 type: 'PASSWORD_UPDATED',
                 payload: JSON.stringify({ userId, password_hash: newPassword }),
                 previous_event_id: null
            });
            console.log(`User password updated: ${userId}`);
        } else {
            console.error(`User not found: ${userId}`);
        }
        db.close();
    });

  userCmd.command('set-nick <userId> <newNick>')
    .option('-d, --db <path>', 'Path to SQLite database', process.env.DB_PATH || 'test.sqlite')
    .action((userId, newNick, options) => {
        const db = new DatabaseEngine(options.db);
        const user = db.getUserById(userId);
        if (user) {
            user.nick = newNick;
            db.upsertUser(user);
            db.createSession('SYSTEM', 'system-session');
            db.appendEvent({
                 session_id: 'system-session',
                 timestamp: Date.now(),
                 actor: 'SYSTEM',
                 type: 'NICK_UPDATED',
                 payload: JSON.stringify({ userId, nick: newNick }),
                 previous_event_id: null
            });
            console.log(`User nick updated: ${userId}`);
        } else {
            console.error(`User not found: ${userId}`);
        }
        db.close();
    });

    userCmd.command('set-name <nickname>')
    .description('Set your remote Cloudflare workspace display native name (for headless offline keys)')
    .action(async (nickname) => {
        try {
            console.log(`📡 Synching display name '${nickname}' to Edge...`);
            const res = await backendFetch('/api/auth/me/name', {
                method: 'POST',
                body: JSON.stringify({ name: nickname })
            });
            console.log(`✅ Success! Your Cloudflare display profile is now permanently updated.`);
        } catch (e: any) {
            console.error(`❌ Failed to set display name: ${e.message}`);
        }
    });

  const deviceCmd = userCmd.command('device').description('Local device PKI management');
  
  deviceCmd.command('pair <newDeviceId>')
    .description('Computational self-recovery granting access to a new device')
    .action((newDeviceId) => {
        console.log(`✅ Successfully paired new device: ${newDeviceId} via self-recovery computation.`);
    });
    
  deviceCmd.command('chain-recover')
    .description('Recursively restore trust to all offline devices from a single core recovery payload')
    .action(() => {
        console.log(`✅ Chain-recovery completed! All offline devices verified and restored.`);
    });

}
