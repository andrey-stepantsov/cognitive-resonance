import { Command } from 'commander';
import * as readline from 'readline';
import { initGemini, generateResponse } from '@cr/core/src/services/GeminiService';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { parseCommand, CommandAction } from '@cr/core/src/services/CommandParser';

// Path to store the CLI authentication token
const TOKEN_FILE_PATH = path.resolve(process.cwd(), '.cr-cli-token');

// Helper to reliably read from stdin if piped
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''; // No data piped in
  }
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => { resolve(data.trim()); });
    process.stdin.on('error', err => { reject(err); });
  });
}

function getCliToken(): string | null {
  try { if (fs.existsSync(TOKEN_FILE_PATH)) return fs.readFileSync(TOKEN_FILE_PATH, 'utf-8').trim(); } catch (e) {} return null;
}
function saveCliToken(token: string) {
  try { fs.writeFileSync(TOKEN_FILE_PATH, token, { mode: 0o600 }); } catch (e) { console.error('[Error] Failed to save authentication token:', e); }
}

async function backendFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const backendUrl = process.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787';
  const url = `${backendUrl.replace(/\/$/, '')}${endpoint}`;
  const headers = new Headers(options.headers as any);
  headers.set('Content-Type', 'application/json');
  const token = getCliToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

// Helper to rehydrate chat history from the database
function loadSessionFromDB(db: DatabaseEngine, sessionId: string): { role: string; content: string }[] {
  const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
  const history: { role: string; content: string }[] = [];
  
  let userCount = 0;
  let aiCount = 0;

  for (const ev of events) {
    if (ev.type === 'USER_PROMPT') {
      try {
        const payload = JSON.parse(ev.payload);
        history.push({ role: 'user', content: payload.text });
        userCount++;
      } catch (e) {}
    } else if (ev.type === 'AI_RESPONSE') {
      try {
        const payload = JSON.parse(ev.payload);
        history.push({ role: 'assistant', content: payload.text });
        aiCount++;
      } catch (e) {}
    }
  }

  if (history.length > 0) {
    console.log(`\n[System] Rehydrated Session: ${sessionId}`);
    console.log(`[System] Context: loaded ${userCount} user prompts and ${aiCount} AI responses.`);
    
    // Print the last turn for context
    const lastUser = history.filter(h => h.role === 'user').pop();
    const lastAI = history.filter(h => h.role === 'assistant').pop();
    console.log('\n--- Last Interaction ---');
    if (lastUser) console.log(`\x1b[36m[User]\x1b[0m ${lastUser.content.substring(0, 100)}${lastUser.content.length > 100 ? '...' : ''}`);
    if (lastAI) console.log(`\x1b[33m[AI]\x1b[0m   ${lastAI.content.substring(0, 100)}${lastAI.content.length > 100 ? '...' : ''}`);
    console.log('------------------------\n');
  } else {
    console.log(`\n[System] Session ${sessionId} is empty or does not exist. Starting fresh.`);
  }

  return history;
}

export function registerChatCommands(program: Command) {
  program
    .command('chat [message]')
    .description('Interactive REPL or headless one-off message to the AI')
    .option('-f, --format <type>', 'Output format (e.g., json, markdown)', 'markdown')
    .option('-m, --model <model>', 'The Gemini model to use', 'gemini-2.5-flash')
    .option('-s, --session <id>', 'Load and append to an existing session ID')
    .action(async (message, options) => {
      const dbPath = program.opts().db || 'cr.sqlite';
      const db = new DatabaseEngine(dbPath);
      
      const apiKey = process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) console.warn('Warning: CR_GEMINI_API_KEY or VITE_GEMINI_API_KEY is not set.');
      else { try { initGemini(apiKey); } catch (err: any) {} }

      // Headless Mode
      if (message) {
        const sessionId = options.session || db.createSession('LOCAL_USER');
        let chatHistory = options.session ? loadSessionFromDB(db, sessionId) : [];
        let lastEventId: string | null = null;
        if (options.session) {
          const events = db.query('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [sessionId]);
          if (events.length > 0) lastEventId = events[0].id;
        }

        const pipedInput = await readStdin();
        let fullPrompt = message;
        if (pipedInput) {
           fullPrompt = `${message}\n\nContext from stdin:\n${pipedInput}`;
        }

        const promptEventId = db.appendEvent({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: 'LOCAL_USER',
          type: 'USER_PROMPT',
          payload: JSON.stringify({ text: fullPrompt }),
          previous_event_id: lastEventId
        });
        lastEventId = promptEventId;

        chatHistory.push({ role: 'user', content: fullPrompt });
        const schema = {
          type: 'OBJECT',
          properties: {
            reply: { type: 'STRING', description: 'Your markdown-formatted response to the user' },
            dissonanceScore: { type: 'INTEGER', description: '0-100 indicating cognitive load' },
            nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, label: { type: 'STRING' } } } }
          },
          required: ['reply', 'dissonanceScore']
        };

        let responsePayload: any;
        try {
          if (options.format !== 'json') process.stdout.write('Thinking...\n');
          responsePayload = await generateResponse(options.model, chatHistory, 'You are a helpful CLI assistant.', schema, undefined, false);
        } catch (err: any) {
          if (options.format === 'json') console.error(JSON.stringify({ error: err.message }));
          else console.error(`\nAPI Error: ${err.message}`);
          process.exit(1);
          return;
        }

        db.appendEvent({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: options.model,
          type: 'AI_RESPONSE',
          payload: JSON.stringify({ text: responsePayload.reply, dissonance: responsePayload.dissonanceScore }),
          previous_event_id: lastEventId
        });
        db.close();

        if (options.format === 'json') {
          console.log(JSON.stringify({
             role: 'assistant',
             content: responsePayload.reply,
             metadata: { dissonanceScore: responsePayload.dissonanceScore, nodes: responsePayload.nodes }
          }));
        } else {
          console.log('\n🤖 Cognitive Resonance');
          console.log('---------------------');
          console.log(responsePayload.reply);
          console.log(`\n[Dissonance: ${responsePayload.dissonanceScore}/100]`);
        }
        return;
      }

      // Interactive REPL Mode
      let sessionId = options.session || db.createSession('LOCAL_USER');
      let currentModel = options.model;
      let chatHistory = options.session ? loadSessionFromDB(db, sessionId) : [];
      let lastEventId: string | null = null;
      if (options.session) {
        const events = db.query('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [sessionId]);
        if (events.length > 0) lastEventId = events[0].id;
      }

      console.log(`Welcome to Cognitive Resonance! Type /help for commands, or hit Ctrl+C to exit. (DB: ${dbPath}, Session: ${sessionId})`);
    
    const schema = {
      type: 'OBJECT',
      properties: { reply: { type: 'STRING' }, dissonanceScore: { type: 'INTEGER' } },
      required: ['reply', 'dissonanceScore']
    };

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'cr> ' });
    rl.prompt();

    rl.on('line', async (line) => {
      const text = line.trim();
      if (!text) { rl.prompt(); return; }
      if (text === '/exit' || text === '/quit') { rl.close(); return; }

      const command = parseCommand(text);

      if (command) {
         switch (command.action) {
          case CommandAction.SESSION_CLEAR:
            chatHistory = [];
            console.log('[System] Session history cleared.');
            break;
          case CommandAction.MODEL_USE:
            if (command.args[0]) {
              currentModel = command.args[0];
              console.log(`[System] Switched to model: ${currentModel}`);
            } else console.log(`[System] Current model: ${currentModel}`);
            break;
          case CommandAction.LOGIN: {
            const email = command.args[0]; const password = command.args[1];
            if (!email || !password) { console.log('[System] Usage: /login <email> <password>'); break; }
            try {
              process.stdout.write('[System] Logging in... ');
              const res = await backendFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
              const data = await res.json() as any;
              if (res.ok && data.token) { saveCliToken(data.token); console.log(`Success! Logged in as ${data.user?.name || email}`);}
              else console.log(`Failed. ${data.error || 'Invalid credentials'}`);
            } catch (err: any) { console.log(`Failed. Network error: ${err.message}`); }
            break;
          }
          case CommandAction.SIGNUP: {
             const email = command.args[0]; const password = command.args[1]; const name = command.args.slice(2).join(' ') || email?.split('@')[0];
             if (!email || !password) { console.log('[System] Usage: /signup <email> <password> [name]'); break; }
             try {
                process.stdout.write('[System] Signing up... ');
                const res = await backendFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
                const data = await res.json() as any;
                if (res.ok && data.token) { saveCliToken(data.token); console.log(`Success! Account created for ${email}`); }
                else console.log(`Failed. ${data.error || 'Could not create account'}`);
             } catch (err: any) { console.log(`Failed. Network error: ${err.message}`); }
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
                 db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PWA_ARCHIVE_TOGGLE', payload: JSON.stringify({ archived: true }), previous_event_id: lastEventId });
                 console.log(`[System] Session ${sessionId} archived.`);
             } else if (text === '/recover') {
                 db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'SYSTEM', type: 'PWA_ARCHIVE_TOGGLE', payload: JSON.stringify({ archived: false }), previous_event_id: lastEventId });
                 console.log(`[System] Session ${sessionId} recovered.`);
             } else if (text === '/clone') {
                 const newSessionId = db.createSession('LOCAL_USER');
                 const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
                 let previousId = null;
                 for (const ev of events) {
                     previousId = db.appendEvent({ session_id: newSessionId, timestamp: ev.timestamp, actor: ev.actor, type: ev.type, payload: ev.payload, previous_event_id: previousId });
                 }
                 sessionId = newSessionId;
                 lastEventId = previousId;
                 console.log(`[System] Session cloned. You are now communicating in the new cloned session: ${sessionId}`);
             } else if (text.startsWith('/session ')) {
                 const newId = text.split(' ')[1];
                 if (newId) {
                     sessionId = newId;
                     chatHistory = loadSessionFromDB(db, sessionId);
                     // Set lastEventId accurately
                     const events = db.query('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [sessionId]);
                     if (events.length > 0) lastEventId = events[0].id;
                     else lastEventId = null;
                 } else console.log('[System] Usage: /session <id>');
             } else if (text === '/ls' || text === '/sessions') {
                 console.log('\n[System] Available Sessions (Archived sessions hidden):');
                 // A sophisticated query to get the last activity and check if the latest PWA_ARCHIVE_TOGGLE is true
                 // For SQLite local CLI, we'll just do a simpler grouped query and filter in memory for robustness
                 const sessionRows = db.query('SELECT session_id, type, payload, timestamp FROM events ORDER BY timestamp ASC');
                 const sessions = new Map<string, { last_activity: number, archived: boolean }>();
                 
                 for (const row of sessionRows) {
                     if (!sessions.has(row.session_id)) sessions.set(row.session_id, { last_activity: row.timestamp, archived: false });
                     const s = sessions.get(row.session_id)!;
                     s.last_activity = row.timestamp;
                     if (row.type === 'PWA_ARCHIVE_TOGGLE') {
                         try { s.archived = JSON.parse(row.payload).archived; } catch(e){}
                     }
                 }
                 
                 const activeSessions = Array.from(sessions.entries()).filter(([id, data]) => !data.archived).sort((a,b) => b[1].last_activity - a[1].last_activity).slice(0, 20);
                 
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
        rl.prompt();
        return;
      }

      // Record prompt
      const promptEventId = db.appendEvent({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: 'LOCAL_USER',
          type: 'USER_PROMPT',
          payload: JSON.stringify({ text }),
          previous_event_id: lastEventId
      });
      lastEventId = promptEventId;

      chatHistory.push({ role: 'user', content: text });
      process.stdout.write('Thinking...\n');

      try {
        const response = await generateResponse(currentModel, chatHistory, 'You are a helpful CLI assistant.', schema, undefined, false);
        console.log(`\n🤖 ${response.reply}\n`);
        chatHistory.push({ role: 'assistant', content: response.reply });

        // Record response
        const responseEventId = db.appendEvent({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: currentModel,
          type: 'AI_RESPONSE',
          payload: JSON.stringify({ text: response.reply, dissonance: response.dissonanceScore }),
          previous_event_id: lastEventId
        });
        lastEventId = responseEventId;

      } catch (err: any) {
        console.error(`\nAPI Error: ${err.message}\n`);
        chatHistory.pop();
        // optionally remove the failed prompt from the DB, but event sourcing implies immutability.
      }
      rl.prompt();
    }).on('close', () => {
      console.log('\nSession ended.');
      db.close();
      process.exit(0);
    });
  });
}
