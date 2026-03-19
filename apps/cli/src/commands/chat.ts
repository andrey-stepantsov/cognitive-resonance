import { Command } from 'commander';
import * as readline from 'readline';
import { initGemini, generateResponse, fetchModels } from '@cr/core/src/services/GeminiService';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { parseCommand, CommandAction, parseMentions } from '@cr/core/src/services/CommandParser';
import { GemProfiles } from '../services/GemRegistry';
import { ArtefactManager } from '@cr/core/src/services/ArtefactManager';
import { exec } from 'child_process';
import * as vm from 'vm';
import { runSyncDaemon } from './serve';
import { backendFetch } from '../utils/api';
import { readStdin, hookStdoutMute } from '../utils/prompt';
import { handleInteractiveCommand, CLIRuntimeState } from '../controllers/CommandHandlers';

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
        history.push({ role: 'model', content: payload.text });
        aiCount++;
      } catch (e) {}
    }
  }

  if (history.length > 0) {
    console.log(`\n[System] Rehydrated Session: ${sessionId}`);
    console.log(`[System] Context: loaded ${userCount} user prompts and ${aiCount} AI responses.`);
    
    // Print the last turn for context
    const lastUser = history.filter(h => h.role === 'user').pop();
    const lastAI = history.filter(h => h.role === 'model').pop();
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

        if (responsePayload.files && Array.isArray(responsePayload.files)) {
          const manager = new ArtefactManager(sessionId, fs, workspaceDir);
          for (const file of responsePayload.files) {
             const filepath = path.resolve(workspaceDir, file.path);
             fs.mkdirSync(path.dirname(filepath), { recursive: true });
             fs.writeFileSync(filepath, file.content);
             const draft = await manager.proposeDraft(file.path, file.content, options.model);
             console.log(`\n[ArtefactManager] Draft proposed: ${draft.branch} for ${file.path}`);
             
             lastEventId = db.appendEvent({
               session_id: sessionId,
               timestamp: Date.now(),
               actor: 'SYSTEM',
               type: 'ARTEFACT_DRAFT',
               payload: JSON.stringify({ path: file.path, branch: draft.branch, commitSha: draft.commitSha }),
               previous_event_id: lastEventId
             });
          }
        }

        db.close();

        if (options.format === 'json') {
          console.log(JSON.stringify({
             role: 'model',
             content: responsePayload.reply,
             metadata: { dissonanceScore: responsePayload.dissonanceScore, nodes: responsePayload.nodes }
          }));
        } else {
          console.log('\n🤖 Cognitive Resonance');
          console.log('---------------------');
          const formattedReply = responsePayload.reply.replace(/\\n/g, '\n');
          console.log(formattedReply);
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
      '/help', '/login', '/signup', '/whoami', '/session', '/session ls', '/session new', 
      '/session clear', '/history', '/model', '/model use', '/model ls', '/gem ls', 
      '/graph ls', '/graph search', '/graph stats', '/clear', '/archive',
      '/recover', '/clone', '/exec', '/exit', '/quit'
    ];
    
    const completer = (line: string) => {
      const words = line.split(' ');
      const currentWord = words[words.length - 1];
      let hits: string[] = [];

      if (line.startsWith('/model use ')) {
         const term = currentWord.toLowerCase();
         hits = availableModels.filter(m => m.toLowerCase().startsWith(term));
         return [hits, currentWord];
      } else if (currentWord.startsWith('@')) {
         const term = currentWord.substring(1).toLowerCase();
         const gemNames = Object.keys(GemProfiles);
         hits = gemNames.filter(name => name.toLowerCase().startsWith(term)).map(n => `@${n}`);
         return [hits, currentWord];
      } else if (line.startsWith('/')) {
         hits = shellCommands.filter(c => c.startsWith(line));
         return [hits, line];
      }

      return [[], line];
    };

    const rl = readline.createInterface({ 
      input: process.stdin, 
      output: process.stdout, 
      prompt: 'cr> ',
      completer 
    });

    const updatePrompt = (nick: string) => {
       rl.setPrompt(`\x1b[35mcr@${nick}\x1b[0m> `);
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
    hookStdoutMute(rl);
    
    // Non-blocking native rendering for incoming events
    const handleIncomingLiveEvent = (ev: any) => {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      
      if (ev.type === 'USER_PROMPT') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        console.log(`\x1b[36m[Remote User @${ev.actor}]\x1b[0m ${payload.text}`);
        chatHistory.push({ role: 'user', content: payload.text });
      } else if (ev.type === 'AI_RESPONSE') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        console.log(`\n🤖 [@${ev.actor}] ${payload.text}\n`);
        chatHistory.push({ role: 'assistant', content: payload.text });
      } else if (ev.type === 'ARTEFACT_DRAFT') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        console.log(`[Remote Artefact] Draft proposed: ${payload.branch} for ${payload.path}`);
      } else if (ev.type === 'RUNTIME_OUTPUT') {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        console.log(`[Remote System Exec Output]:\n${payload.text}`);
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
      error: (msg: string) => { console.error(`\x1b[31m${msg}\x1b[0m`); }
    };

    console.log(`[System] Background Sync Daemon started. Connecting to Edge...`);
    // Run immediately once, then interval
    runSyncDaemon(db, mockClients, silentLogger);
    const syncIntervalId = setInterval(() => runSyncDaemon(db, mockClients, silentLogger), 5000);

    rl.prompt();

    rl.on('line', async (line) => {
      const text = line.trim();
      if (!text) { rl.prompt(); return; }
      if (text === '/exit' || text === '/quit') { rl.close(); return; }

      if (text.startsWith('/exec ')) {
        const cmd = text.slice(6).trim();
        console.log(`[System] Executing: ${cmd}`);
        
        const execEventId = (outputStr: string) => {
          console.log(outputStr);
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

        if (cmd.startsWith('node ')) {
          const parts = cmd.split(' ');
          const scriptFile = parts[1];
          const scriptArgs = parts.slice(2);
          const filepath = path.resolve(workspaceDir, scriptFile);
          
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
          exec(cmd, { cwd: workspaceDir }, (error: any, stdout: string, stderr: string) => {
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
        const state: CLIRuntimeState = { sessionId, currentModel, lastEventId, chatHistory };
        await handleInteractiveCommand({
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
        const systemPrompt = explicitTarget ? GemProfiles[explicitTarget] : 'You are a helpful CLI assistant.';

        process.stdout.write(`Thinking (@${activeActor})...\n`);

        try {
          const response = await generateResponse(currentModel, chatHistory, systemPrompt, schema, undefined, false);
          const formattedReply = response.reply.replace(/\\n/g, '\n');
          console.log(`\n🤖 [@${activeActor}] ${formattedReply}\n`);
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

          if (response.files && Array.isArray(response.files)) {
            const manager = new ArtefactManager(sessionId, fs, workspaceDir);
            for (const file of response.files) {
               const filepath = path.resolve(workspaceDir, file.path);
               fs.mkdirSync(path.dirname(filepath), { recursive: true });
               fs.writeFileSync(filepath, file.content);
               const draft = await manager.proposeDraft(file.path, file.content, activeActor);
               console.log(`[ArtefactManager] Draft proposed: ${draft.branch} for ${file.path}`);
               const draftEventId = db.appendEvent({
                 session_id: sessionId,
                 timestamp: Date.now(),
                 actor: 'SYSTEM',
                 type: 'ARTEFACT_DRAFT',
                 payload: JSON.stringify({ path: file.path, branch: draft.branch, commitSha: draft.commitSha }),
                 previous_event_id: lastEventId
               });
               lastEventId = draftEventId;
            }
          }

          // Check for handoffs
          const responseMentions = parseMentions(response.reply);
          const nextTargetGem = responseMentions.find(m => GemProfiles[m] && m !== activeActor);
          
          if (nextTargetGem) {
            console.log(`[System] Handoff to @${nextTargetGem} detected.`);
            nextInput = `[System] @${activeActor} called @${nextTargetGem}. Please proceed based on their output.`;
            explicitTarget = nextTargetGem;
            isFirstTurn = false;
          } else {
            break; // No more handoffs
          }
        } catch (err: any) {
          console.error(`\nAPI Error: ${err.message}\n`);
          chatHistory.pop();
          break;
        }
      }
      rl.prompt();
    }).on('close', () => {
      clearInterval(syncIntervalId);
      console.log('\nSession ended.');
      db.close();
      process.exit(0);
    });
  });
}
