import { saveCliToken, backendFetch } from '../utils/api.js';
import { DatabaseEngine } from '../db/DatabaseEngine.js';
import { fetchModels } from '@cr/core/src/services/GeminiService.js';
import { parseCommand, CommandAction } from '@cr/core/src/services/CommandParser.js';
import { InteractiveIo, IoAdapter } from '../utils/IoAdapter.js';

export interface CLIRuntimeState {
  sessionId: string;
  currentModel: string;
  lastEventId: string | null;
  chatHistory: { role: string; content: string }[];
  semanticFocus: string[];
}

export interface CLIControllerContext {
  state: CLIRuntimeState;
  db: DatabaseEngine;
  rl: InteractiveIo;
  io: IoAdapter;
  text: string;           // Original raw command text
  command: NonNullable<ReturnType<typeof parseCommand>>; // The parsed slash command
  updatePrompt: (nick: string) => void;
  loadSessionFromDB: (db: DatabaseEngine, sessionId: string, io: IoAdapter) => { role: string; content: string }[];
}

export async function handleInteractiveCommand(ctx: CLIControllerContext): Promise<void> {
  const { state, db, rl, io, text, command, updatePrompt, loadSessionFromDB } = ctx;

  switch (command.action) {
    case CommandAction.SESSION_CLEAR:
      state.chatHistory = [];
      io.print('[System] Session history cleared.');
      break;

    case CommandAction.MODEL_USE:
      if (command.args[0] === 'ls') {
        io.write('\n[System] Fetching available models from Google... ');
        try {
          const models = await fetchModels();
          io.print('Done.\n');
          for (const m of models) {
            io.print(`  - \x1b[36m${m.name.replace('models/', '')}\x1b[0m (${m.displayName})`);
          }
          io.print('\nTip: Use /model use <model_name> to switch.\n');
        } catch (err: any) {
          io.print(`Failed. ${err.message}`);
        }
      } else if (command.args[0]) {
        state.currentModel = command.args[0];
        io.print(`[System] Switched to model: ${state.currentModel}`);
      } else {
        io.print(`[System] Current model: ${state.currentModel}`);
      }
      break;

    case CommandAction.LOGIN: {
      const email = command.args[0];
      if (!email) { io.print('[System] Usage: /login <email> [password]'); break; }
      let password = command.args[1];
      if (!password) password = await rl.questionHidden('Password: ');
      if (!password) { io.print('[System] Password cannot be empty.'); break; }

      try {
        io.write('[System] Logging in... ');
        const res = await backendFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        const data = await res.json() as any;
        if (res.ok && data.token) {
          saveCliToken(data.token);
          const nick = data.user?.name || email.split('@')[0];
          updatePrompt(nick);
          io.print(`Success! Logged in as ${nick}`);
        } else {
          io.print(`Failed. ${data.error || 'Invalid credentials'}`);
        }
      } catch (err: any) { io.print(`Failed. Network error: ${err.message}`); }
      break;
    }

    case CommandAction.SIGNUP: {
      const email = command.args[0];
      if (!email) { io.print('[System] Usage: /signup <email> [password] [name]'); break; }
      let password = command.args[1];
      let name = command.args.slice(2).join(' ');

      if (!password) {
        password = await rl.questionHidden('Choose a Password: ');
        if (!password) { io.print('[System] Password cannot be empty.'); break; }
        name = await rl.question('Display Name (optional): ');
        name = name.trim() || email.split('@')[0];
      } else if (!name) {
        name = email.split('@')[0];
      }

      try {
        io.write('[System] Signing up... ');
        const res = await backendFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
        const data = await res.json() as any;
        if (res.ok && data.token) {
          saveCliToken(data.token);
          updatePrompt(name);
          io.print(`Success! Account created for ${email}`);
        } else {
          io.print(`Failed. ${data.error || 'Could not create account'}`);
        }
      } catch (err: any) { io.print(`Failed. Network error: ${err.message}`); }
      break;
    }

    case CommandAction.WHOAMI: {
      try {
        io.write('[System] Checking authentication... ');
        const res = await backendFetch('/api/auth/me', { method: 'GET' });
        const data = await res.json() as any;
        if (res.ok && data.user) {
          io.print(`\n  ✅ Logged in as: \x1b[36m${data.user.name}\x1b[0m (${data.user.email})`);
        } else {
          io.print(`\n  ❌ Not logged in. Please use /login or /signup.`);
        }
      } catch (err: any) { io.print(`Failed. Network error: ${err.message}`); }
      break;
    }

    case CommandAction.HOST_LS: {
      io.print('\n[System] Active Global Presence Map (Hosts):');
      try {
         const rows = db.query("SELECT actor, payload, timestamp FROM events WHERE type IN ('ENVIRONMENT_JOINED', 'PRESENCE_UPDATE') ORDER BY timestamp DESC") as any[];
         const hosts = new Map<string, any>();
         for (const r of rows) {
            if (!hosts.has(r.actor)) hosts.set(r.actor, r);
         }
         
         if (hosts.size === 0) {
            io.print('  No hosts have announced presence yet.');
         } else {
            io.print('  HOST IDENTITY       | OS / ARCH     | CAPABILITIES        | LAST SEEN');
            io.print('  -----------------------------------------------------------------------------------------');
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
                  io.print(`  ${r.actor.padEnd(19)} | ${osArch.padEnd(13)} | ${capStr.padEnd(19)} | ${dateStr}`);
               } catch (e) {}
            }
         }
      } catch (err: any) {
         io.print(`  Failed to retrieve hosts: ${err.message}`);
      }
      io.print('');
      break;
    }

    case CommandAction.HOST_INFO: {
      const target = command.args[0];
      if (!target) {
         io.print('[System] Usage: /host info <target>');
         break;
      }
      try {
         const rows = db.query("SELECT * FROM events WHERE type IN ('ENVIRONMENT_JOINED', 'PRESENCE_UPDATE') AND actor = ? ORDER BY timestamp DESC LIMIT 1", [target]) as any[];
         if (rows.length === 0) {
            io.print(`[System] Unknown host: ${target}`);
         } else {
            const r = rows[0];
            const p = JSON.parse(r.payload);
            io.print(`\n[Host Info: ${target}]`);
            io.print(`  Last Seen:    ${new Date(r.timestamp).toISOString()}`);
            io.print(`  OS / Arch:    ${p.capabilities?.os} / ${p.capabilities?.arch}`);
            io.print(`  Node Support: ${p.capabilities?.node ? 'Yes' : 'No'}`);
            io.print(`  Python Supp:  ${p.capabilities?.python ? 'Yes' : 'No'}`);
            io.print('');
         }
      } catch(e: any) {
         io.print(`[System] Error retrieving host: ${e.message}`);
      }
      break;
    }

    case CommandAction.INVITE:
      io.print('[System] Invite is a PWA cloud feature (not supported in local SQLite yet).');
      break;

    case CommandAction.SESSION_DELETE:
      io.print('[System] Hard deletion is disabled. Please use /archive instead.');
      break;

    case CommandAction.SESSION_LS:
    case CommandAction.SESSION_LOAD:
    case CommandAction.SESSION_NEW:
    case CommandAction.UNKNOWN:
      if (text === '/archive') {
        db.appendEvent({ session_id: state.sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PWA_ARCHIVE_TOGGLE', payload: JSON.stringify({ archived: true }), previous_event_id: state.lastEventId });
        io.print(`[System] Session ${state.sessionId} archived.`);
      } else if (text === '/recover') {
        db.appendEvent({ session_id: state.sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PWA_ARCHIVE_TOGGLE', payload: JSON.stringify({ archived: false }), previous_event_id: state.lastEventId });
        io.print(`[System] Session ${state.sessionId} recovered.`);
      } else if (text === '/clone' || command.action === CommandAction.SESSION_CLONE) {
        const newSessionId = db.createSession('LOCAL_USER');
        const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [state.sessionId]) as any[];
        let previousId = null;
        for (const ev of events) {
          previousId = db.appendEvent({ session_id: newSessionId, timestamp: ev.timestamp, actor: ev.actor, type: ev.type, payload: ev.payload, previous_event_id: previousId });
        }
        state.sessionId = newSessionId;
        state.lastEventId = previousId;
        io.print(`[System] Session cloned. You are now communicating in the new cloned session: ${state.sessionId}`);
      } else if (text === '/session' || (text.startsWith('/session ') && !text.startsWith('/session ls')) || text.startsWith('/new ') || (command.action === CommandAction.SESSION_LOAD && command.args[0] !== 'ls') || command.action === CommandAction.SESSION_NEW) {
        let newId = command.args[0] || text.split(' ')[1];
        if (newId) {
          state.sessionId = newId;
          state.chatHistory = loadSessionFromDB(db, state.sessionId, io);
          // Set lastEventId accurately
          const events = db.query('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [state.sessionId]) as any[];
          if (events.length > 0) state.lastEventId = events[0].id;
          else state.lastEventId = null;
        } else {
          // TODO: [Feature Request] Allow `/session` with no arguments to print detailed info/metadata about the currently active session.
          const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [state.sessionId]) as any[];
          io.print(`\n[Active Session Info]`);
          io.print(`  ID: \x1b[36m${state.sessionId}\x1b[0m`);
          io.print(`  Model: ${state.currentModel}`);
          io.print(`  Total Events: ${sessionEvents.length}`);
          const latest = sessionEvents[sessionEvents.length - 1];
          io.print(`  Last Activity: ${latest ? new Date(latest.timestamp).toISOString() : 'None'}`);
          io.print('');
        }
      } else if (text === '/ls' || text.startsWith('/session ls') || text === '/sessions' || command.action === CommandAction.SESSION_LS) {
        // TODO: [Feature Request] Support wildcards (or regex) for all commands that list objects (e.g., `/session ls tmp*`).
        // TODO: [Feature Request] Implement an `--all` flag to view archived sessions.
        const showAll = text.includes('--all');
        const parts = text.split(' ');
        const wildcard = parts.find(p => p !== '/session' && p !== 'ls' && p !== '/ls' && p !== '--all');
        let regex: RegExp | null = null;
        if (wildcard) {
           regex = new RegExp('^' + wildcard.replace(/\*/g, '.*') + '$', 'i');
        }

        io.print('\n[System] Available Sessions:');
        const sessionRows = db.query('SELECT session_id, type, payload, timestamp FROM events ORDER BY timestamp ASC') as any[];
        const sessions = new Map<string, { last_activity: number, archived: boolean }>();

        for (const row of sessionRows) {
          if (!sessions.has(row.session_id)) sessions.set(row.session_id, { last_activity: row.timestamp, archived: false });
          const s = sessions.get(row.session_id)!;
          s.last_activity = row.timestamp;
          if (row.type === 'PWA_ARCHIVE_TOGGLE') {
            try { s.archived = JSON.parse(row.payload).archived; } catch (e) {}
          }
        }

        let activeSessions = Array.from(sessions.entries());
        if (!showAll) activeSessions = activeSessions.filter(([id, data]) => !data.archived);
        if (regex) activeSessions = activeSessions.filter(([id, data]) => regex!.test(id));

        activeSessions = activeSessions.sort((a, b) => b[1].last_activity - a[1].last_activity).slice(0, 20);

        for (const [id, data] of activeSessions) {
          io.print(`  - \x1b[36m${id}\x1b[0m (Last Active: ${new Date(data.last_activity).toISOString()})${data.archived ? ' [Archived]' : ''}`);
        }
        if (activeSessions.length === 0) io.print('  No sessions found.');
        io.print('');
      } else {
        io.print(`[System] Unrecognized command: ${command.raw}`);
      }
      break;

    default:
      io.print(`[System] Unrecognized command: ${command.raw}`);
      break;
  }
}
