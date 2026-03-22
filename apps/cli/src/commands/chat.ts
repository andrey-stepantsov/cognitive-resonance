import { Command } from 'commander';
import { IoAdapter, DefaultIoAdapter } from '../utils/IoAdapter';
import { initGemini, generateResponse, fetchModels } from '@cr/core/src/services/GeminiService';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { parseCommand, CommandAction, parseMentions, parseDslRouting } from '@cr/core/src/services/CommandParser';
import { GemProfiles } from '../services/GemRegistry';
import { ArtefactManager } from '@cr/core/src/services/ArtefactManager';
import { Materializer } from '@cr/core/src/services/Materializer';
import { exec } from 'child_process';
import chalk from 'chalk';
import { highlight } from 'cli-highlight';
const markdown = require('cli-markdown');
import * as vm from 'vm';
import { runSyncDaemon } from './serve';
import { backendFetch } from '../utils/api';
import { readStdin } from '../utils/prompt';
import { handleInteractiveCommand, CLIRuntimeState } from '../controllers/CommandHandlers';

// Helper to rehydrate chat history from the database
function loadSessionFromDB(db: DatabaseEngine, sessionId: string, io: IoAdapter): { role: string; content: string }[] {
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
        history.push({ role: 'model', content: payload.text });
        aiCount++;
      } catch (e) {}
    }
  }

  if (history.length > 0) {
    io.print(`\n[System] Rehydrated Session: ${sessionId}`);
    io.print(`[System] Context: loaded ${userCount} user prompts and ${aiCount} AI responses.`);
    
    // Print the last turn for context
    const lastUser = history.filter(h => h.role === 'user').pop();
    const lastAI = history.filter(h => h.role === 'model').pop();
    io.print('\n--- Last Interaction ---');
    if (lastUser) io.print(`\x1b[36m[User]\x1b[0m ${lastUser.content.substring(0, 100)}${lastUser.content.length > 100 ? '...' : ''}`);
    if (lastAI) io.print(`\x1b[33m[AI]\x1b[0m   ${lastAI.content.substring(0, 100)}${lastAI.content.length > 100 ? '...' : ''}`);
    io.print('------------------------\n');
  } else {
    io.print(`\n[System] Session ${sessionId} is empty or does not exist. Starting fresh.`);
  }

  return history;
}

export function registerChatCommands(program: Command, io: IoAdapter = new DefaultIoAdapter()) {
  program
    .command('chat [message]')
    .description('Interactive REPL or headless one-off message to the AI')
    .option('-f, --format <type>', 'Output format (e.g., json, markdown)', 'markdown')
    .option('-m, --model <model>', 'The Gemini model to use', 'gemini-2.5-flash')
    .option('-s, --session <id>', 'Load and append to an existing session ID')
    .option('-w, --workspace <path>', 'Workspace directory for context and artefacts', process.cwd())
    .action(async (message, options) => {
      const workspaceDir = path.resolve(process.cwd(), options.workspace);
      
      const defaultDbPath = path.join(path.resolve(workspaceDir, '.cr'), 'cr.sqlite');
      const dbPath = program.opts().db ? path.resolve(process.cwd(), program.opts().db) : defaultDbPath;
      
      if (!fs.existsSync(workspaceDir)) {
          fs.mkdirSync(workspaceDir, { recursive: true });
      }
      
      if (dbPath === defaultDbPath && !fs.existsSync(path.resolve(workspaceDir, '.cr'))) {
          fs.mkdirSync(path.resolve(workspaceDir, '.cr'), { recursive: true });
      }
      
      const db = new DatabaseEngine(dbPath);
      
      const apiKey = process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) io.printError('Warning: CR_GEMINI_API_KEY or VITE_GEMINI_API_KEY is not set.');
      else { try { initGemini(apiKey); } catch (err: any) {} }

      // Headless Mode
      if (message) {
        const sessionId = options.session || db.createSession('LOCAL_USER');
        let chatHistory = options.session ? loadSessionFromDB(db, sessionId, io) : [];
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
            nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, label: { type: 'STRING' } } } },
            files: {
              type: 'ARRAY',
              description: 'Optional list of files to create or update',
              items: {
                type: 'OBJECT',
                properties: { path: { type: 'STRING', description: 'Relative file path' }, content: { type: 'STRING', description: 'Full file content' } },
                required: ['path', 'content']
              }
            }
          },
          required: ['reply', 'dissonanceScore']
        };

        // TODO: [Testing] Write an E2E test to verify that the Virtual Filesystem Context is correctly injected into the AI's system prompt during Headless chat and REPL chat after a repository import.
        const materializerHeadless = new Materializer(workspaceDir);
        const sessionEventsHeadless = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
        const virtualStateHeadless = materializerHeadless.computeVirtualState(sessionEventsHeadless);
        let systemPromptHeadless = 'You are a helpful CLI assistant.';
        if (virtualStateHeadless.size > 0) {
            let vfsContext = `\n\n--- Current Workspace Virtual Filesystem ---\n`;
            for (const [filepath, content] of virtualStateHeadless.entries()) {
                vfsContext += `\n[File: ${filepath}]\n${content}\n`;
            }
            systemPromptHeadless += vfsContext;
        }

        let responsePayload: any;
        try {
          if (options.format !== 'json') io.write('Thinking...\n');
          responsePayload = await generateResponse(options.model, chatHistory, systemPromptHeadless, schema, undefined, false);
        } catch (err: any) {
          if (options.format === 'json') io.printError(JSON.stringify({ error: err.message }));
          else io.printError(`\nAPI Error: ${err.message}`);
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

        if (responsePayload.files && Array.isArray(responsePayload.files) && responsePayload.files.length > 0) {
          const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
          const manager = new ArtefactManager(workspaceDir, sessionEvents);
          const proposals = await manager.proposeDrafts(responsePayload.files);
          
          for (const proposal of proposals) {
             io.print(`\n[ArtefactManager] Proposal drafted: virtual state for ${proposal.path}`);
             
             lastEventId = db.appendEvent({
               session_id: sessionId,
               timestamp: Date.now(),
               actor: 'SYSTEM',
               type: 'ARTEFACT_PROPOSAL',
               payload: JSON.stringify(proposal),
               previous_event_id: lastEventId
             });
          }
        }

        db.close();

        if (options.format === 'json') {
          io.print(JSON.stringify({
             role: 'model',
             content: responsePayload.reply,
             metadata: { dissonanceScore: responsePayload.dissonanceScore, nodes: responsePayload.nodes }
          }));
        } else {
          io.print('\n🤖 Cognitive Resonance');
          io.print('---------------------');
          let rendered = '';
          try { rendered = markdown(responsePayload.reply); }
          catch(e) { rendered = responsePayload.reply.replace(/\\n/g, '\n'); }
          io.print(rendered);
          io.print(`\n[Dissonance: ${responsePayload.dissonanceScore}/100]`);
        }
        return;
      }

      // Interactive REPL Mode
      let sessionId = options.session || db.createSession('LOCAL_USER');
      let currentModel = options.model;
      let chatHistory = options.session ? loadSessionFromDB(db, sessionId, io) : [];
      let lastEventId: string | null = null;
      let semanticFocus: string[] = [];
      if (options.session) {
        const events = db.query('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [sessionId]);
        if (events.length > 0) lastEventId = events[0].id;
      }

      io.print(`Welcome to Cognitive Resonance! Type /help for commands, or hit Ctrl+C to exit. (DB: ${dbPath}, Session: ${sessionId})`);
    
    let availableModels: string[] = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b'];
    fetchModels().then(models => {
       if (models && models.length > 0) {
          availableModels = models.map(m => m.name.replace('models/', ''));
       }
    }).catch(() => {});

    const schema = {
      type: 'OBJECT',
      properties: { 
        reply: { type: 'STRING' }, 
        dissonanceScore: { type: 'INTEGER' },
        files: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { path: { type: 'STRING' }, content: { type: 'STRING' } },
            required: ['path', 'content']
          }
        }
      },
      required: ['reply', 'dissonanceScore']
    };

    const shellCommands = [
      '/help', '/login', '/signup', '/whoami', '/activate', '/session', '/session ls', '/session new', 
      '/session clear', '/history', '/model', '/model use', '/model ls', '/gem ls', 
      '/graph ls', '/graph search', '/graph stats', '/clear', '/archive',
      '/recover', '/clone', '/exec', '/exit', '/quit', '/cat', '/read', '/ls', '/tree'
    ];
    
    // TODO: [UX] All CLI commands must provide help and a brief description (ideally with auto-complete style using TAB).
    const completer = (line: string) => {
      const words = line.split(' ');
      const currentWord = words[words.length - 1];
      let hits: string[] = [];

      if (line.startsWith('/model use ')) {
         const term = currentWord.toLowerCase();
         hits = availableModels.filter(m => m.toLowerCase().startsWith(term));
         return [hits, currentWord] as [string[], string];
      } else if (currentWord.startsWith('@')) {
         const term = currentWord.substring(1).toLowerCase();
         const gemNames = Object.keys(GemProfiles);
         hits = gemNames.filter(name => name.toLowerCase().startsWith(term)).map(n => `@${n}`);
         return [hits, currentWord] as [string[], string];
      } else if (line.startsWith('/cat ') || line.startsWith('/read ') || line.startsWith('/ls ')) {
          const prefix = line.split(' ').slice(1).join(' ');
          let fileHits: string[] = [];
          try {
             const fileEvents = db.query("SELECT payload FROM events WHERE session_id = ? AND type = 'ARTEFACT_PROPOSAL'", [sessionId]) as any[];
             const files = new Set<string>();
             for (const ev of fileEvents) {
                 try {
                    const p = JSON.parse(ev.payload);
                    if (p.path) files.add(p.path);
                    if (p.target) files.add(p.target);
                 } catch(e) {}
             }
             let allowedFiles = Array.from(files);
             if (semanticFocus.length > 0) {
                 const prefixes = semanticFocus.map(f => f.replace('#path:', ''));
                 allowedFiles = allowedFiles.filter(f => prefixes.some(p => f.startsWith(p)));
             }
             fileHits = allowedFiles.filter(f => f.startsWith(prefix));
          } catch(e) {}
          return [fileHits.map(h => line.split(' ')[0] + ' ' + h), line] as [string[], string];
      } else if (line.startsWith('/')) {
         hits = shellCommands.filter(c => c.startsWith(line));
         return [hits, line] as [string[], string];
      }

      return [[], line] as [string[], string];
    };

    // TODO: [UX] Implement persistent up-arrow command history across REPL restarts by seeding `rl.history` from the `events` table for this session.
    const rl = io.createInteractive(completer);
    
    // Seed readline history from the virtual event table
    try {
       const userPromptEvents = db.query("SELECT payload FROM events WHERE session_id = ? AND type = 'USER_PROMPT' ORDER BY timestamp DESC", [sessionId]) as any[];
       const historyStrings = userPromptEvents.map(ev => {
          try {
             const p = JSON.parse(ev.payload);
             return p.text;
          } catch(e) { return null; }
       }).filter(Boolean);
       if (historyStrings.length > 0) {
           (rl as any).history = historyStrings;
       }
    } catch (e: any) { }

    let currentNick = 'user';
    const updatePrompt = (nick?: string) => {
       if (nick) currentNick = nick;
       const focusStr = semanticFocus.length > 0 ? ` {\x1b[36m${semanticFocus.join(', ')}\x1b[0m}` : '';
       rl.setPrompt(`\x1b[35mcr@${currentNick}\x1b[0m${focusStr}> `);
    };

    // Attempt to load the user's nickname asynchronously to decorate the prompt
    backendFetch('/api/auth/me', { method: 'GET' })
       .then(r => r.json())
       .then((d: any) => { 
          if (d && d.user && d.user.name) {
             updatePrompt(d.user.name);
             rl.prompt(true);
          } 
       })
       .catch(() => {});

    // Intercept stdout once to prevent echoing keystrokes during secure password entry
    // hookStdoutMute removed
    
    // Non-blocking native rendering for incoming events
    const handleIncomingLiveEvent = (ev: any) => {
      rl.clearLine();
      rl.cursorTo(0);
      
      if (ev.type === 'USER_PROMPT') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        // TODO: [UX] Use a vibrant chalk color for the remote user nick specifically, to distinguish from standard logging.
        io.print(`${chalk.cyanBright(`[Remote User @${ev.actor}]`)} ${payload.text}`);
        chatHistory.push({ role: 'user', content: payload.text });
      } else if (ev.type === 'AI_RESPONSE') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        // TODO: [UX] Colorize the AI Response explicitly, and format markdown snippets natively using libraries like `cli-markdown` or `marked-terminal`.
        let rendered = '';
        try { rendered = markdown(payload.text); }
        catch(e) { rendered = payload.text; }
        io.print(`\n🤖 [@${ev.actor}]\n${rendered}\n`);
        chatHistory.push({ role: 'assistant', content: payload.text });
      } else if (ev.type === 'ARTEFACT_PROPOSAL') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        io.print(`[Remote Artefact] Proposal drafted for ${payload.path}`);
      } else if (ev.type === 'RUNTIME_OUTPUT') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        io.print(`[Remote System Exec Output]:\n${payload.text}`);
      }
      
      if (!lastEventId || ev.id > lastEventId) {
         lastEventId = ev.id;
      }
      
      rl.prompt(true);
    };

    const mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: (msg: string) => {
        try {
          const data = JSON.parse(msg);
          if (data.type === 'event' && data.event.session_id === sessionId) {
             handleIncomingLiveEvent(data.event);
          }
        } catch(e) {}
      }
    } as any;
    const mockClients = new Set<any>([mockWs]);
    
    const silentLogger = {
      info: () => {},
      error: (msg: string) => { io.printError(`\x1b[31m${msg}\x1b[0m`); }
    };

    io.print(`[System] Background Sync Daemon started. Connecting to Edge...`);
    // Run immediately once, then interval
    runSyncDaemon(db, mockClients, silentLogger);
    const syncIntervalId = io.setInterval(() => runSyncDaemon(db, mockClients, silentLogger), 5000);

    rl.prompt();

    rl.onLine(async (line) => {
      const text = line.trim();
      if (!text) { rl.prompt(); return; }
      if (text === '/exit' || text === '/quit') { rl.close(); return; }
      if (text === '/help') {
         io.print(chalk.yellow('\n--- Cognitive Resonance Commands ---'));
         io.print(chalk.green('  /activate <token>') + '- Activate Edge access using offline token');
         io.print(chalk.green('  /login <email>   ') + '- Authenticate with Edge');
         io.print(chalk.green('  /session ls      ') + '- View active sessions');
         io.print(chalk.green('  /session <id>    ') + '- Switch to session');
         io.print(chalk.green('  /model use <name>') + '- Switch active Gemini model');
         io.print(chalk.green('  /focus <tags>    ') + '- Restrict scope (e.g., #path:src)');
         io.print(chalk.green('  /focus clear     ') + '- Clear current Semantic Focus');
         io.print(chalk.green('  /ls [dir]        ') + '- List files in Virtual FS');
         io.print(chalk.green('  /tree            ') + '- Tree view of Virtual FS');
         io.print(chalk.green('  /read <file>     ') + '- Inject file content into context');
         io.print(chalk.green('  /cat <file>      ') + '- Print file from VFS');
         io.print(chalk.green('  /exec <cmd>      ') + '- Execute shell command in sandbox');
         io.print(chalk.cyanBright('  @@TargetName(exec "...") ') + '- Dispatch execution to a specific host over Edge middleware\n');
         rl.prompt();
         return;
      }

      if (text.startsWith('/focus')) {
         const args = text.slice(6).trim();
         if (args === 'clear') {
             semanticFocus = [];
             io.print('[System] Semantic Focus cleared.');
         } else if (args === 'ls') {
             io.print(`\n[Semantic Focus Bound]`);
             if (semanticFocus.length === 0) io.print('  (None)');
             else semanticFocus.forEach(f => io.print(`  - ${f}`));
             io.print('');
         } else if (args) {
             const additions = args.split(' ').filter(Boolean).map(a => a.startsWith('#') ? a : `#path:${a}`);
             for (const add of additions) {
                 if (!semanticFocus.includes(add)) semanticFocus.push(add);
             }
             io.print(`[System] Appended Semantic Focus: ${additions.join(' ')}`);
         } else {
             io.print('[System] Usage: /focus <tags/paths> | clear | ls');
         }
         updatePrompt();
         rl.prompt();
         return;
      }

      if (text.startsWith('/activate ')) {
         const token = text.slice(10).trim();
         if (!token) { io.print('[System] Usage: /activate <base64_token>'); rl.prompt(); return; }
         
         try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Invalid token format');
            
            // Core package resolves path from dist.
            // When running locally: `__dirname` is apps/cli/dist/commands
            // The public key resides in packages/core/src/scripts/.keys/ed25519.pub
            const publicKeyPath = require('path').resolve(__dirname, '../../../../packages/core/src/scripts/.keys/ed25519.pub');
            
            if (!require('fs').existsSync(publicKeyPath)) {
                throw new Error('Public Key ed25519.pub not bundled in CLI. Cannot verify. (Developer: Please run mint_token.ts first)');
            }
            
            const publicKey = require('crypto').createPublicKey(require('fs').readFileSync(publicKeyPath));
            
            const isValid = require('crypto').verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'));
            if (!isValid) throw new Error('Mathematical signature is invalid or forged');
            
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token has expired');
            
            require('../utils/api').saveCliToken(token);
            io.print(chalk.green(`\n[System] ✅ Environment Activated Successfully!`));
            io.print(`  Identity: ${payload.sub}`);
            io.print(`  Expires:  ${new Date(payload.exp * 1000).toLocaleString()}\n`);
            
         } catch (err: any) {
            io.print(chalk.red(`\n[System] ❌ Activation Failed: ${err.message}\n`));
         }
         rl.prompt();
         return;
      }

      if (text.startsWith('/cat ')) {
        const filePath = text.slice(5).trim();
        const materializer = new Materializer(workspaceDir);
        const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
        
        const content = await materializer.getVirtualFileContent(filePath, sessionEvents);
        if (content) {
          const ext = filePath.split('.').pop() || 'txt';
          io.print(`\n--- ${filePath} ---`);
          io.print(highlight(content, { language: ext, ignoreIllegals: true }));
          io.print('--- EOF ---\n');
        } else {
          io.print(`[System] File not found or empty in virtual state: ${filePath}`);
        }
        rl.prompt();
        return;
      }

      if (text.startsWith('/read ')) {
        const filePath = text.slice(6).trim();
        const materializer = new Materializer(workspaceDir);
        const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
        
        const content = await materializer.getVirtualFileContent(filePath, sessionEvents);
        if (content) {
          const injectionText = `[System] Injected context for ${filePath}:\n\n${content}`;
          chatHistory.push({ role: 'user', content: injectionText });
          
          lastEventId = db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: 'LOCAL_USER',
            type: 'USER_PROMPT',
            payload: JSON.stringify({ text: injectionText }),
            previous_event_id: lastEventId
          });
          
          io.print(chalk.gray(`[System] Injected ${filePath} into AI Context.`));
        } else {
          io.print(chalk.yellow(`[System] Could not read ${filePath} from virtual state.`));
        }
        rl.prompt();
        return;
      }

      if (text === '/ls' || text.startsWith('/ls ')) {
          if (text === '/ls --all' || text === '/ls -a') { /* Let CommandHandlers route to `/session ls` if needed, although we are shadowing now. Better to avoid intercepting `ls` args meant for session, but user explicitly asked for VFS ls */ }
          const dir = text.startsWith('/ls ') ? text.slice(4).trim() : '';
          const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
          const materializer = new Materializer(options.workspace || process.cwd());
          const virtualState = materializer.computeVirtualState(sessionEvents);
          let files = Array.from(virtualState.keys());
          if (semanticFocus.length > 0) {
             const prefixes = semanticFocus.map(f => f.replace('#path:', ''));
             files = files.filter(f => prefixes.some(p => f.startsWith(p)));
          }
          
          io.print(`\n📁 Virtual Directory: /${dir}`);
          let count = 0;
          const distinct = new Set<string>();
          for (const f of files) {
              if (f.startsWith(dir)) {
                  let remainder = dir ? f.slice(dir.length) : f;
                  if (remainder.startsWith('/')) remainder = remainder.slice(1);
                  const firstLevel = remainder.split('/')[0];
                  if (firstLevel) distinct.add(firstLevel);
              }
          }
          const sorted = Array.from(distinct).sort();
          for (const d of sorted) {
             io.print(`  - \x1b[36m${d}\x1b[0m`);
             count++;
          }
          if (count === 0) io.print(`  (empty)`);
          io.print('');
          rl.prompt();
          return;
      }

      if (text === '/tree') {
          const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
          const materializer = new Materializer(options.workspace || process.cwd());
          const virtualState = materializer.computeVirtualState(sessionEvents);
          let files = Array.from(virtualState.keys()).sort();
          if (semanticFocus.length > 0) {
             const prefixes = semanticFocus.map(f => f.replace('#path:', ''));
             files = files.filter(f => prefixes.some(p => f.startsWith(p)));
          }
          
          io.print(`\n🌳 Virtual Filesystem Tree:`);
          if (files.length === 0) {
             io.print(`  (empty)`);
          } else {
             for (const f of files) {
                const parts = f.split('/');
                const name = parts.pop();
                const indent = '  '.repeat(parts.length);
                io.print(`${indent}├── \x1b[36m${name}\x1b[0m`);
             }
          }
          io.print('');
          rl.prompt();
          return;
      }

      if (text.startsWith('/exec ')) {
        const cmd = text.slice(6).trim();
        io.print(`[System] Executing: ${cmd}`);
        
        const execEventId = (outputStr: string) => {
          io.print(outputStr);
          chatHistory.push({ role: 'user', content: `[System Exec Output]:\n${outputStr}` });
          const newId = db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: 'SYSTEM',
            type: 'RUNTIME_OUTPUT',
            payload: JSON.stringify({ text: outputStr }),
            previous_event_id: lastEventId
          });
          lastEventId = newId;
          rl.prompt();
        };

        const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
        const materializer = new Materializer(workspaceDir);
        const sandboxDir = path.resolve(workspaceDir, '.cr', 'sandbox', sessionId);
        
        await materializer.computeAndMaterialize(sessionEvents, sandboxDir);

        try {
           const latestSymlink = path.resolve(workspaceDir, '.cr', 'sandbox', 'latest');
           if (fs.existsSync(latestSymlink)) fs.unlinkSync(latestSymlink);
           fs.symlinkSync(sessionId, latestSymlink, 'dir');
        } catch(e) {}

        io.print(chalk.dim(`[System] Sandbox Materialized at: ${sandboxDir}`));
        io.print(chalk.dim(`[System] Synced via alias: .cr/sandbox/latest`));

        if (cmd.startsWith('node ')) {
          const parts = cmd.split(' ');
          const scriptFile = parts[1];
          const scriptArgs = parts.slice(2);
          const filepath = path.resolve(sandboxDir, scriptFile);
          
          let output = '';
          try {
             const code = fs.readFileSync(filepath, 'utf8');
             const context = vm.createContext({
               console: {
                 log: (...args: any[]) => { output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n'; },
                 error: (...args: any[]) => { output += 'Error: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n'; }
               },
               process: { argv: ['node', scriptFile, ...scriptArgs] },
               Buffer: Buffer
             });
             vm.runInNewContext(code, context, { timeout: 5000 });
             if (!output) output = '(Execution completed with no output)';
             execEventId(output.trim());
          } catch (err: any) {
             execEventId(`Error executing script natively in Isolate sandbox: ${err.message}`);
          }
        } else {
          exec(cmd, { cwd: sandboxDir }, (error: any, stdout: string, stderr: string) => {
            let output = '';
            if (stdout) output += stdout;
            if (stderr) output += '\nError: ' + stderr;
            if (error) output += '\nExit Code: ' + error.code;
            
            execEventId(output.trim() || '(No output)');
          });
        }
        return;
      }

      const command = parseCommand(text);

      if (command) {
        const state: CLIRuntimeState = { sessionId, currentModel, lastEventId, chatHistory, semanticFocus };
        await handleInteractiveCommand({ io,
          state,
          db,
          rl,
          text,
          command,
          updatePrompt,
          loadSessionFromDB
        });
        
        // Unpack potentially mutated state
        sessionId = state.sessionId;
        currentModel = state.currentModel;
        lastEventId = state.lastEventId;
        chatHistory = state.chatHistory;
        semanticFocus = state.semanticFocus;

        rl.prompt();
        return;
      }

      // Intercept User Lisp DSL Directives for Remote Execution
      const userDslIntents = parseDslRouting(text);
      let skipAiLoop = false;
      for (const intent of userDslIntents) {
          if (intent.host && intent.ast && Array.isArray(intent.ast) && intent.ast[0] === 'exec') {
              const cmd = intent.ast.slice(1).join(' ');
              io.print(`[System] Routing remote execution to @@${intent.host}...`);
              
              const execEventId = db.appendEvent({
                  session_id: sessionId,
                  timestamp: Date.now(),
                  actor: 'LOCAL_USER',
                  type: 'EXECUTION_REQUESTED',
                  payload: JSON.stringify({ target: intent.host, command: cmd }),
                  previous_event_id: lastEventId
              });
              lastEventId = execEventId;
              
              chatHistory.push({ role: 'user', content: `[System] Skipped LLM turn: Executed \`${cmd}\` on ${intent.host}. Waiting for RUNTIME_OUTPUT.` });
              
              // If the user's entire prompt was just the routing command, skip AI interaction
              if (text.trim() === intent.rawCommand) {
                 skipAiLoop = true;
              }
          }
      }

      if (skipAiLoop) {
          rl.prompt();
          return;
      }

      // Automatic Handoff Loop
      let nextInput = text;
      let isFirstTurn = true;
      let explicitTarget: string | undefined;

      const initialMentions = parseMentions(text);
      explicitTarget = initialMentions.find(m => GemProfiles[m]);
      
      while (nextInput) {
        if (!isFirstTurn) {
          chatHistory.push({ role: 'user', content: nextInput });
        } else {
          // Record initial literal user prompt
          const promptEventId = db.appendEvent({
              session_id: sessionId,
              timestamp: Date.now(),
              actor: 'LOCAL_USER',
              type: 'USER_PROMPT',
              payload: JSON.stringify({ text: nextInput }),
              previous_event_id: lastEventId
          });
          lastEventId = promptEventId;
          chatHistory.push({ role: 'user', content: nextInput });
        }

        const activeActor = explicitTarget ? explicitTarget : currentModel;
        let systemPrompt = explicitTarget ? GemProfiles[explicitTarget] : 'You are a helpful CLI assistant.';

        if (activeActor.toLowerCase() === 'trinity') {
           io.print(`[System] Initializing Pre-Flight Discovery for @trinity...`);
           let discoveryContext = `\n\n--- Pre-Flight Discovery (Local Skills & Memories) ---\n`;
           
           const skillsDir = path.resolve(process.cwd(), '.agents/skills');
           if (fs.existsSync(skillsDir)) {
              const readSkillsRecursive = (dir: string) => {
                 const files = fs.readdirSync(dir);
                 for (const file of files) {
                    const fullPath = path.join(dir, file);
                    if (fs.statSync(fullPath).isDirectory()) {
                       readSkillsRecursive(fullPath);
                    } else if (file.endsWith('.md') || file.endsWith('.ts')) {
                       const content = fs.readFileSync(fullPath, 'utf8');
                       const relativePath = path.relative(process.cwd(), fullPath);
                       discoveryContext += `\n[Skill Blueprint: ${relativePath}]\n${content}\n`;
                    }
                 }
              };
              try { readSkillsRecursive(skillsDir); io.print(`[System] Loaded local skills from .agents/skills/`); }
              catch(e) {}
           }

           try {
              const res = await backendFetch('/api/search?limit=3&q=' + encodeURIComponent(nextInput));
              if (res.ok) {
                 const data = await res.json() as any;
                 if (data.results && data.results.length > 0) {
                     discoveryContext += `\n[Related Historical Sessions (Vectorize)]\n`;
                     data.results.forEach((r: any) => {
                        discoveryContext += `- ${r.customName || r.sessionId}: ${r.preview}\n`;
                     });
                     io.print(`[System] Retrieved ${data.results.length} related memory chunks from Vectorize.`);
                 }
              }
           } catch (e: any) {}

           systemPrompt += discoveryContext;
        }

        // TODO: [Testing] Write an E2E test to verify that the Virtual Filesystem Context is correctly injected into the AI's system prompt during Headless chat and REPL chat after a repository import.
        const materializer = new Materializer(workspaceDir);
        const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
        const virtualState = materializer.computeVirtualState(sessionEvents);
        if (virtualState.size > 0) {
            let vfsContext = `\n\n--- Current Workspace Virtual Filesystem ---\n`;
            for (const [filepath, content] of virtualState.entries()) {
                vfsContext += `\n[File: ${filepath}]\n${content}\n`;
            }
            systemPrompt += vfsContext;
        }

        io.write(`Thinking (@${activeActor})...\n`);

        try {
          const response = await generateResponse(currentModel, chatHistory, systemPrompt, schema, undefined, false);
          let rendered = '';
          try { rendered = markdown(response.reply); }
          catch(e) { rendered = response.reply.replace(/\\n/g, '\n'); }
          io.print(`\n🤖 [@${activeActor}]\n${rendered}\n`);
          chatHistory.push({ role: 'model', content: response.reply });

          // Record response
          const responseEventId = db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: activeActor,
            type: 'AI_RESPONSE',
            payload: JSON.stringify({ text: response.reply, dissonance: response.dissonanceScore }),
            previous_event_id: lastEventId
          });
          lastEventId = responseEventId;

          if (response.files && Array.isArray(response.files) && response.files.length > 0) {
            const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
            const manager = new ArtefactManager(workspaceDir, sessionEvents);
            const proposals = await manager.proposeDrafts(response.files);
            
            for (const proposal of proposals) {
               io.print(`[ArtefactManager] Proposal drafted: virtual state for ${proposal.path}`);
               const draftEventId = db.appendEvent({
                 session_id: sessionId,
                 timestamp: Date.now(),
                 actor: 'SYSTEM',
                 type: 'ARTEFACT_PROPOSAL',
                 payload: JSON.stringify(proposal),
                 previous_event_id: lastEventId
               });
               lastEventId = draftEventId;
            }
          }

          // Check for DSL routing in AI response
          const aiDslIntents = parseDslRouting(response.reply);
          for (const intent of aiDslIntents) {
              if (intent.host && intent.ast && Array.isArray(intent.ast) && intent.ast[0] === 'exec') {
                  const cmd = intent.ast.slice(1).join(' ');
                  io.print(`[System] AI requested remote execution on @@${intent.host}...`);
                  const execEventId = db.appendEvent({
                      session_id: sessionId,
                      timestamp: Date.now(),
                      actor: activeActor,
                      type: 'EXECUTION_REQUESTED',
                      payload: JSON.stringify({ target: intent.host, command: cmd }),
                      previous_event_id: lastEventId
                  });
                  lastEventId = execEventId;
              }
          }

          // Check for handoffs
          const dslIntents = parseDslRouting(response.reply);
          const agentHandoff = dslIntents.find(i => i.agent && GemProfiles[i.agent.toLowerCase()] && i.agent.toLowerCase() !== activeActor.toLowerCase());
          
          let nextTargetGem = agentHandoff ? agentHandoff.agent.toLowerCase() : null;
          let handoffPayload = agentHandoff?.ast ? JSON.stringify(agentHandoff.ast) : null;

          if (!nextTargetGem) {
            // fallback to simple mentions
            const responseMentions = parseMentions(response.reply);
            nextTargetGem = responseMentions.find(m => GemProfiles[m] && m !== activeActor.toLowerCase());
          }
          
          if (nextTargetGem) {
            io.print(`[System] Handoff to @${nextTargetGem} detected.`);
            nextInput = `[System] @${activeActor} called @${nextTargetGem}. Please proceed based on their output.`;
            if (handoffPayload) {
                 nextInput += `\\nDirect Instruction (AST): ${handoffPayload}`;
            }
            explicitTarget = nextTargetGem;
            isFirstTurn = false;
          } else {
            break; // No more handoffs
          }
        } catch (err: any) {
          io.printError(`\nAPI Error: ${err.message}\n`);
          chatHistory.pop();
          break;
        }
      }
      rl.prompt();
    });
    rl.onClose(() => {
      io.clearInterval(syncIntervalId);
      io.print('\nSession ended.');
      db.close();
      process.exit(0);
    });
  });
}
