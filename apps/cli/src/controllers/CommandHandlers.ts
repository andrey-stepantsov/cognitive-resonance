import * as readline from 'readline';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { saveCliToken, backendFetch } from '../utils/api';
import { askSecure } from '../utils/prompt';
import { fetchModels } from '@cr/core/src/services/GeminiService';
import { parseCommand, CommandAction } from '@cr/core/src/services/CommandParser';

export interface CLIRuntimeState {
  sessionId: string;
  currentModel: string;
  lastEventId: string | null;
  chatHistory: { role: string; content: string }[];
}

export interface CLIControllerContext {
  state: CLIRuntimeState;
  db: DatabaseEngine;
  rl: readline.Interface;
  text: string;           // Original raw command text
  command: NonNullable<ReturnType<typeof parseCommand>>; // The parsed slash command
  updatePrompt: (nick: string) => void;
  loadSessionFromDB: (db: DatabaseEngine, sessionId: string) => { role: string; content: string }[];
}

export async function handleInteractiveCommand(ctx: CLIControllerContext): Promise<void> {
  const { state, db, rl, text, command, updatePrompt, loadSessionFromDB } = ctx;

  switch (command.action) {
    case CommandAction.SESSION_CLEAR:
      state.chatHistory = [];
      console.log('[System] Session history cleared.');
      break;

    case CommandAction.MODEL_USE:
      if (command.args[0] === 'ls') {
        process.stdout.write('\n[System] Fetching available models from Google... ');
        try {
          const models = await fetchModels();
          console.log('Done.\n');
          for (const m of models) {
            console.log(`  - \x1b[36m${m.name.replace('models/', '')}\x1b[0m (${m.displayName})`);
          }
          console.log('\nTip: Use /model use <model_name> to switch.\n');
        } catch (err: any) {
          console.log(`Failed. ${err.message}`);
        }
      } else if (command.args[0]) {
        state.currentModel = command.args[0];
        console.log(`[System] Switched to model: ${state.currentModel}`);
      } else {
        console.log(`[System] Current model: ${state.currentModel}`);
      }
      break;

    case CommandAction.LOGIN: {
      const email = command.args[0];
      if (!email) { console.log('[System] Usage: /login <email> [password]'); break; }
      let password = command.args[1];
      if (!password) password = await askSecure(rl, 'Password: ');
      if (!password) { console.log('[System] Password cannot be empty.'); break; }

      try {
        process.stdout.write('[System] Logging in... ');
        const res = await backendFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        const data = await res.json() as any;
        if (res.ok && data.token) {
          saveCliToken(data.token);
          const nick = data.user?.name || email.split('@')[0];
          updatePrompt(nick);
          console.log(`Success! Logged in as ${nick}`);
        } else {
          console.log(`Failed. ${data.error || 'Invalid credentials'}`);
        }
      } catch (err: any) { console.log(`Failed. Network error: ${err.message}`); }
      break;
    }

    case CommandAction.SIGNUP: {
      const email = command.args[0];
      if (!email) { console.log('[System] Usage: /signup <email> [password] [name]'); break; }
      let password = command.args[1];
      let name = command.args.slice(2).join(' ');

      if (!password) {
        password = await askSecure(rl, 'Choose a Password: ');
        if (!password) { console.log('[System] Password cannot be empty.'); break; }
        name = await new Promise(res => rl.question('Display Name (optional): ', (ans) => res(ans.trim() || email.split('@')[0])));
      } else if (!name) {
        name = email.split('@')[0];
      }

      try {
        process.stdout.write('[System] Signing up... ');
        const res = await backendFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
        const data = await res.json() as any;
        if (res.ok && data.token) {
          saveCliToken(data.token);
          updatePrompt(name);
          console.log(`Success! Account created for ${email}`);
        } else {
          console.log(`Failed. ${data.error || 'Could not create account'}`);
        }
      } catch (err: any) { console.log(`Failed. Network error: ${err.message}`); }
      break;
    }

    case CommandAction.WHOAMI: {
      try {
        process.stdout.write('[System] Checking authentication... ');
        const res = await backendFetch('/api/auth/me', { method: 'GET' });
        const data = await res.json() as any;
        if (res.ok && data.user) {
          console.log(`\n  ✅ Logged in as: \x1b[36m${data.user.name}\x1b[0m (${data.user.email})`);
        } else {
          console.log(`\n  ❌ Not logged in. Please use /login or /signup.`);
        }
      } catch (err: any) { console.log(`Failed. Network error: ${err.message}`); }
      break;
    }

    case CommandAction.HOST_LS: {
      console.log('\n[System] Active Global Presence Map (Hosts):');
      try {
         const rows = db.query("SELECT actor, payload, timestamp FROM events WHERE type IN ('ENVIRONMENT_JOINED', 'PRESENCE_UPDATE') ORDER BY timestamp DESC") as any[];
         const hosts = new Map<string, any>();
         for (const r of rows) {
            if (!hosts.has(r.actor)) hosts.set(r.actor, r);
         }
         
         if (hosts.size === 0) {
            console.log('  No hosts have announced presence yet.');
         } else {
            console.log('  HOST IDENTITY       | OS / ARCH     | CAPABILITIES        | LAST SEEN');
            console.log('  -----------------------------------------------------------------------------------------');
            for (const r of hosts.values()) {
               try {
                  const p = JSON.parse(r.payload);
                  const caps = p.capabilities || {};
                  const osArch = `${caps.os || '?'}/${caps.arch || '?'}`;
                  const tools = [];
                  if (caps.node) tools.push('Node');
                  if (caps.python) tools.push('Python');
                  const capStr = tools.join(',');
                  const dateStr = new Date(r.timestamp).toISOString();
                  console.log(`  ${r.actor.padEnd(19)} | ${osArch.padEnd(13)} | ${capStr.padEnd(19)} | ${dateStr}`);
               } catch (e) {}
            }
         }
      } catch (err: any) {
         console.log(`  Failed to retrieve hosts: ${err.message}`);
      }
      console.log('');
      break;
    }

    case CommandAction.HOST_INFO: {
      const target = command.args[0];
      if (!target) {
         console.log('[System] Usage: /host info <target>');
         break;
      }
      try {
         const rows = db.query("SELECT * FROM events WHERE type IN ('ENVIRONMENT_JOINED', 'PRESENCE_UPDATE') AND actor = ? ORDER BY timestamp DESC LIMIT 1", [target]) as any[];
         if (rows.length === 0) {
            console.log(`[System] Unknown host: ${target}`);
         } else {
            const r = rows[0];
            const p = JSON.parse(r.payload);
            console.log(`\n[Host Info: ${target}]`);
            console.log(`  Last Seen:    ${new Date(r.timestamp).toISOString()}`);
            console.log(`  OS / Arch:    ${p.capabilities?.os} / ${p.capabilities?.arch}`);
            console.log(`  Node Support: ${p.capabilities?.node ? 'Yes' : 'No'}`);
            console.log(`  Python Supp:  ${p.capabilities?.python ? 'Yes' : 'No'}`);
            console.log('');
         }
      } catch(e: any) {
         console.log(`[System] Error retrieving host: ${e.message}`);
      }
      break;
    }

    case CommandAction.INVITE:
      console.log('[System] Invite is a PWA cloud feature (not supported in local SQLite yet).');
      break;

    case CommandAction.SESSION_DELETE:
      console.log('[System] Hard deletion is disabled. Please use /archive instead.');
      break;

    case CommandAction.UNKNOWN:
      if (text === '/archive') {
        db.appendEvent({ session_id: state.sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PWA_ARCHIVE_TOGGLE', payload: JSON.stringify({ archived: true }), previous_event_id: state.lastEventId });
        console.log(`[System] Session ${state.sessionId} archived.`);
      } else if (text === '/recover') {
        db.appendEvent({ session_id: state.sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PWA_ARCHIVE_TOGGLE', payload: JSON.stringify({ archived: false }), previous_event_id: state.lastEventId });
        console.log(`[System] Session ${state.sessionId} recovered.`);
      } else if (text === '/clone') {
        const newSessionId = db.createSession('LOCAL_USER');
        const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [state.sessionId]) as any[];
        let previousId = null;
        for (const ev of events) {
          previousId = db.appendEvent({ session_id: newSessionId, timestamp: ev.timestamp, actor: ev.actor, type: ev.type, payload: ev.payload, previous_event_id: previousId });
        }
        state.sessionId = newSessionId;
        state.lastEventId = previousId;
        console.log(`[System] Session cloned. You are now communicating in the new cloned session: ${state.sessionId}`);
      } else if (text.startsWith('/session ')) {
        const newId = text.split(' ')[1];
        if (newId) {
          state.sessionId = newId;
          state.chatHistory = loadSessionFromDB(db, state.sessionId);
          // Set lastEventId accurately
          const events = db.query('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [state.sessionId]);
          if (events.length > 0) state.lastEventId = events[0].id;
          else state.lastEventId = null;
        } else {
          console.log('[System] Usage: /session <id>');
        }
      } else if (text === '/ls' || text === '/sessions') {
        console.log('\n[System] Available Sessions (Archived sessions hidden):');
        const sessionRows = db.query('SELECT session_id, type, payload, timestamp FROM events ORDER BY timestamp ASC');
        const sessions = new Map<string, { last_activity: number, archived: boolean }>();

        for (const row of sessionRows) {
          if (!sessions.has(row.session_id)) sessions.set(row.session_id, { last_activity: row.timestamp, archived: false });
          const s = sessions.get(row.session_id)!;
          s.last_activity = row.timestamp;
          if (row.type === 'PWA_ARCHIVE_TOGGLE') {
            try { s.archived = JSON.parse(row.payload).archived; } catch (e) {}
          }
        }

        const activeSessions = Array.from(sessions.entries()).filter(([id, data]) => !data.archived).sort((a, b) => b[1].last_activity - a[1].last_activity).slice(0, 20);

        for (const [id, data] of activeSessions) {
          console.log(`  - \x1b[36m${id}\x1b[0m (Last Active: ${new Date(data.last_activity).toISOString()})`);
        }
        if (activeSessions.length === 0) console.log('  No active sessions found.');
        console.log('');
      } else {
        console.log(`[System] Unrecognized command: ${command.raw}`);
      }
      break;

    default:
      console.log(`[System] Unrecognized command: ${command.raw}`);
      break;
  }
}
