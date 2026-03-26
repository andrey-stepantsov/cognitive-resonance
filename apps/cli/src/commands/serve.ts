import { Command } from 'commander';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine.js';
import * as http from 'http';
import { logger } from '../utils/logger.js';
import chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { ArtefactManager } from '@cr/core/src/services/ArtefactManager.js';
import { Materializer } from 'cr-core-contracts';
import { parseDslRouting } from '@cr/core/src/services/CommandParser.js';
import { DynamicDispatch } from '@cr/core/src/services/DynamicDispatch.js';
import { generateSubWorker } from '@cr/core/src/utils/SubWorkerTemplate.js';
import * as pty from 'node-pty';
import { DefaultIoAdapter, IoAdapter } from '../utils/IoAdapter.js';
import { validateEventSequence } from 'cr-core-contracts';
import { fetchSessionToken, getCliToken, CR_DIR } from '../utils/api.js';
const activeTerminals = new Map<string, pty.IPty>();
const terminalBuffers = new Map<string, { buffer: string, timeout: NodeJS.Timeout | null }>();

// removed the broken outer wrapper
export function createServerApp(dbEngine: DatabaseEngine, clients: Set<WebSocket>) {
  const app = express();
  
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  function broadcastEvent(event: any) {
    const message = JSON.stringify({ type: 'event', event });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // API Endpoints
  app.get('/api/events/:sessionId', (req, res) => {
    try {
      const events = dbEngine.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [req.params.sessionId]);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/events', (req, res) => {
    try {
      const since = parseInt(req.query.since as string || '0', 10);
      const events = dbEngine.query('SELECT * FROM events WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 500', [since]);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/events', (req, res) => {
    try {
      const event: EventRecord = req.body;
      try {
        validateEventSequence(event);
      } catch (err: any) {
        return res.status(400).json({ error: `Validation Error: ${err.message}` });
      }
      
      const id = dbEngine.appendEvent(event);
      
      const eventRecord = dbEngine.get('SELECT * FROM events WHERE id = ?', [id]);
      broadcastEvent(eventRecord);
      
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/events/batch', (req, res) => {
    try {
      const body = req.body;
      if (!body || !Array.isArray(body.events)) {
        return res.status(400).json({ error: 'Expected { events: [] }' });
      }

      for (const ev of body.events) {
        try {
          validateEventSequence(ev);
        } catch (err: any) {
          return res.status(400).json({ error: `Validation Error on event ${ev.id || 'unknown'}: ${err.message}` });
        }
      }

      for (const ev of body.events) {
        // Use insertRemoteEvent to INSERT OR IGNORE and set sync_status = 'SYNCED'
        dbEngine.insertRemoteEvent(ev);
        broadcastEvent(dbEngine.get('SELECT * FROM events WHERE id = ?', [ev.id]));
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[Batch Error]', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sessions', (req, res) => {
    try {
      const sessions = dbEngine.query('SELECT * FROM sessions');
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/entities', (req, res) => {
    try {
      const entities = dbEngine.query('SELECT * FROM entities');
      res.json(entities);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sessions', (req, res) => {
    try {
      const { owner_id, id } = req.body;
      const newId = dbEngine.createSession(owner_id || 'local-user', id);
      res.json({ id: newId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/health', (req, res) => {
    try {
      const dbStats = dbEngine.get('SELECT count(*) as count FROM events') as { count: number };
      const sessionStats = dbEngine.get('SELECT count(*) as count FROM sessions') as { count: number };
      const mem = process.memoryUsage();
      
      res.json({
        status: 'ok',
        activeTerminals: activeTerminals.size,
        webSockets: clients.size,
        dbMetrics: {
          totalEvents: dbStats?.count || 0,
          totalSessions: sessionStats?.count || 0
        },
        memoryUsage: {
          rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
          external: Math.round(mem.external / 1024 / 1024) + ' MB'
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

export function registerServeCommand(program: Command, io: IoAdapter = new DefaultIoAdapter()) {
  program
    .command('serve')
    .description('Start a local HTTP/WebSocket event-sourced server for the monorepo')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('-n, --name <name>', 'Explicit semantic host name (deprecated, use --identity)')
    .option('-i, --identity <identity>', 'Explicit semantic host identity')
    .action((options, command) => {
      const globalOpts = command.parent?.opts() || {};
      const defaultDbPath = path.join(CR_DIR, 'central.sqlite');
      const dbPath = program.opts().db || defaultDbPath;
      
      if (dbPath === defaultDbPath && !fs.existsSync(CR_DIR)) {
          fs.mkdirSync(CR_DIR, { recursive: true });
      }
      
      const dbEngine = new DatabaseEngine(dbPath);
      const clients = new Set<WebSocket>();
      const app = createServerApp(dbEngine, clients);

      const server = http.createServer(app);
      const wss = new WebSocketServer({ server });

      wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => {
          clients.delete(ws);
        });
      });

      const port = parseInt(options.port, 10);
      server.listen(port, () => {
        logger.info(`[Cognitive Resonance] Local Backend serving on http://localhost:${port}`);
        logger.info(`[Cognitive Resonance] WebSocket listening on ws://localhost:${port}`);
        logger.info(`[Cognitive Resonance] Using database at ${dbPath}`);
        
        // Initialize File Watcher - Disabled for Central Edge Server to prevent infinite fs.writeFile mtime loops
        logger.info(`[Cognitive Resonance] File watcher disabled for edge node.`);

        const hostName = options.identity || options.name || process.env.CR_HOST_NAME || `${os.platform()}-${os.userInfo().username}`;
        
        const capabilities = {
           os: os.platform(),
           arch: os.arch(),
           node: true,
           python: (() => { try { require('child_process').execSync('python3 --version', { stdio: 'ignore' }); return true; } catch { return false; } })()
        };

        dbEngine.appendEvent({
           session_id: 'SYSTEM',
           timestamp: Date.now(),
           actor: hostName,
           type: 'ENVIRONMENT_JOINED',
           payload: JSON.stringify({ host: hostName, capabilities }),
           previous_event_id: null
        });

        logger.info(`[Cognitive Resonance] Semantic host identity: ${hostName}`);

        // Start Background Sync Daemon
        const syncIntervalMs = 5000;
        logger.info(`[Cognitive Resonance] Starting background Edge Sync daemon (interval: ${syncIntervalMs}ms)`);
        
        io.setInterval(() => runSyncDaemon(dbEngine, clients, logger, hostName), syncIntervalMs);
      });
    });
}

export async function runSyncDaemon(dbEngine: DatabaseEngine, clients: Set<WebSocket>, logger: any, hostName: string = 'unknown-host') {
   try {
      
      let token = await fetchSessionToken();
      if (!token) token = getCliToken();
            // Try local override first, then Vite production env, then fallback
      let backendUrl = 'http://localhost:8787';
      if (process.env.CR_ENV === 'prod') backendUrl = 'https://api.andrey-stepantsov.workers.dev';
      else if (process.env.CR_ENV === 'staging') backendUrl = 'https://api-staging.andrey-stepantsov.workers.dev';
      
      backendUrl = process.env.CR_EDGE_URL || process.env.CR_CLOUD_URL || process.env.VITE_CLOUDFLARE_WORKER_URL || backendUrl;
      const baseUrl = backendUrl.replace(/\/$/, '');
      
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const correlationId = crypto.randomUUID();
      headers.set('X-Request-Id', correlationId);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      
      // 1. Push Phase
      const pendingEvents = dbEngine.getPendingEvents();
      if (pendingEvents.length > 0) {
         const res = await fetch(`${baseUrl}/api/events/batch`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ events: pendingEvents })
         });
         
         if (res.ok) {
            dbEngine.markEventsSynced(pendingEvents.map((e: any) => e.id));
         } else if (res.status !== 401) {
            logger.error(`[Sync Daemon] Edge Push Failed: ${res.status} ${res.statusText}`);
         }
      }
      
      // 2. Pull Phase
      const latestTs = dbEngine.getLatestEventTimestamp();
      const pullRes = await fetch(`${baseUrl}/api/events?since=${latestTs}`, {
         method: 'GET',
         headers
      });
      
      if (pullRes.ok) {
         const data = await pullRes.json() as any;
         let incomingEvents: any[] = data.events || [];
         
         const validEvents = [];
         for (const rawEv of incomingEvents) {
            try {
               validateEventSequence(rawEv);
               // Mathematically filter out system/global artefacts to prevent local DB bloat
               const isSystemArtefact = (rawEv.session_id === 'SYSTEM' || rawEv.actor === 'System' || rawEv.user_id === 'system') && 
                                        (rawEv.type === 'ARTEFACT_PROMOTED' || rawEv.type === 'ARTEFACT_PROPOSED');
               if (!isSystemArtefact) {
                   validEvents.push(rawEv);
               }
            } catch (err: any) {
               logger.warn(`[Sync Daemon] Edge sent invalid event ${rawEv.id}, skipping: ${err.message}`);
            }
         }
         incomingEvents = validEvents;

         if (incomingEvents.length > 0) {
            logger.info(`[Sync Daemon] Pulled ${incomingEvents.length} new events from the Edge.`);
            for (const ev of incomingEvents) {
               let conflict = false;
               if (ev.type === 'MANUAL_OVERRIDE' || ev.type === 'ARTEFACT_PROMOTED') {
                  // In Model 2 (Virtual Event Stream), we no longer compute merge conflicts against local Git HEAD during polling.
                  // Instead, we just append the remote event, allowing the Materializer to resolve it virtually.
                  // Over time, a more sophisticated virtual 3-way merge could be implemented here.
                  conflict = false;
               }
               
               if (conflict) {
                  logger.error(`[Sync Daemon] Conflict detected for event ${ev.id}. Halting update.`);
                  dbEngine.appendEvent({
                     session_id: ev.session_id,
                     timestamp: Date.now(),
                     actor: 'System',
                     type: 'MERGE_CONFLICT',
                     payload: JSON.stringify({ conflicting_event_id: ev.id }),
                     previous_event_id: ev.previous_event_id || null
                  });
                  break; // halt the loop
               } else {
                  dbEngine.insertRemoteEvent(ev);
                  
                  // Handle Remote Execution Routing
                  if (ev.type === 'EXECUTION_REQUESTED') {
                     const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
                     
                     let explicitTarget = payload.target;
                     let execCommand = payload.command;
                     let isCloudflareDeploy = false;
                     let isCloudflareTeardown = false;
                     let cloudflareTargetName = '';

                     try {
                        const intents = parseDslRouting(payload.command || '');
                        if (intents.length > 0) {
                           const intent = intents[0];
                           explicitTarget = intent.host || intent.agent || explicitTarget;
                           
                           if (explicitTarget === 'CloudflareEdge' && intent.ast && Array.isArray(intent.ast)) {
                               if (intent.ast[0] === 'deploy') {
                                   isCloudflareDeploy = true;
                                   cloudflareTargetName = intent.ast[1] as string;
                               } else if (intent.ast[0] === 'teardown') {
                                   isCloudflareTeardown = true;
                                   cloudflareTargetName = intent.ast[1] as string;
                               }
                           } else if (intent.ast && Array.isArray(intent.ast) && intent.ast[0] === 'exec') {
                              execCommand = intent.ast[1] as string;
                           }
                        }
                     } catch(e) {}

                     console.log("SERVE ROUTER:", { payload, explicitTarget, isCloudflareDeploy, cloudflareTargetName });

                     if (isCloudflareDeploy || isCloudflareTeardown) {
                         logger.info(`[Sync Daemon] Orchestrating Cloudflare Edge deployment for: ${cloudflareTargetName}`);
                         const workspaceDir = process.cwd();
                         
                         let dispatcher: DynamicDispatch;
                         try {
                            dispatcher = new DynamicDispatch();
                         } catch (err: any) {
                            logger.error(`[Sync Daemon] Cloudflare deploy aborted: ${err.message}`);
                            continue;
                         }

                         if (isCloudflareTeardown) {
                             dispatcher.teardown(cloudflareTargetName).then(() => {
                                 const ts = Date.now();
                                 const msg = `[Edge] Successfully destroyed sub-worker: ${cloudflareTargetName}`;
                                 dbEngine.appendEvent({ session_id: ev.session_id, timestamp: ts, actor: 'CloudflareEdge', type: 'RUNTIME_OUTPUT', payload: JSON.stringify({ text: msg }), previous_event_id: ev.id });
                             }).catch((err: any) => {
                                 logger.error(`[Sync Daemon] Cloudflare teardown failed: ${err.message}`);
                             });
                         } else if (isCloudflareDeploy) {
                             const sessionEvents = dbEngine.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [ev.session_id]) as any[];
                             const materializer = new Materializer(workspaceDir);
                             const sandboxDir = path.resolve(workspaceDir, '.cr', 'sandbox', ev.session_id);
                             
                             materializer.computeAndMaterialize(sessionEvents, sandboxDir).then(() => {
                                 const targetFilePath = path.join(sandboxDir, cloudflareTargetName + '.ts');
                                 let sourceCode = '';
                                 try {
                                     sourceCode = fs.readFileSync(targetFilePath, 'utf8');
                                 } catch(e) {
                                     sourceCode = `export default { fetch: () => new Response("Module code not found for ${cloudflareTargetName}.ts") }`;
                                 }
                                 
                                 // Auto-wrap into default export if raw script
                                 if (!sourceCode.includes('export default')) {
                                     sourceCode = generateSubWorker(sourceCode);
                                 }

                                 dispatcher.deploy(cloudflareTargetName, sourceCode, workspaceDir).then((url: string) => {
                                     const ts = Date.now();
                                     const msg = `[Edge] Successfully deployed to ${url}`;
                                     dbEngine.appendEvent({ session_id: ev.session_id, timestamp: ts, actor: 'CloudflareEdge', type: 'RUNTIME_OUTPUT', payload: JSON.stringify({ text: msg, url }), previous_event_id: ev.id });
                                 }).catch((err: any) => {
                                     logger.error(`[Sync Daemon] Cloudflare deploy failed: ${err.message}`);
                                 });
                             });
                         }
                         continue;
                     }

                     if (explicitTarget === hostName || explicitTarget === 'all') {
                        logger.info(`[Sync Daemon] Received execution request for this host: ${execCommand}`);
                        const sessionEvents = dbEngine.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [ev.session_id]) as any[];
                        const workspaceDir = process.cwd();
                        const materializer = new Materializer(workspaceDir);
                        const sandboxDir = path.resolve(workspaceDir, '.cr', 'sandbox', ev.session_id);
                        
                        materializer.computeAndMaterialize(sessionEvents, sandboxDir).then(() => {
                            exec(execCommand, { cwd: sandboxDir }, (error: any, stdout: string, stderr: string) => {
                               let output = '';
                               if (stdout) output += stdout;
                               if (stderr) output += '\nError: ' + stderr;
                               if (error) output += '\nExit Code: ' + error.code;
                               
                               dbEngine.appendEvent({
                                  session_id: ev.session_id,
                                  timestamp: Date.now(),
                                  actor: hostName,
                                  type: 'RUNTIME_OUTPUT',
                                  payload: JSON.stringify({ text: output.trim() || '(No output)' }),
                                  previous_event_id: ev.id
                                });
                            });
                        }).catch((err: any) => {
                            logger.error(`[Sync Daemon] Failed to materialize sandbox: ${err.message}`);
                        });
                     }
                  }

                   // Handle Terminal Interactive Spawning
                   if (ev.type === 'TERMINAL_SPAWN') {
                      const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
                      if (payload.target === hostName || payload.target === 'all') {
                         const workspaceDir = process.cwd();
                         const sandboxDir = path.resolve(workspaceDir, '.cr', 'sandbox', ev.session_id);
                         const materializer = new Materializer(workspaceDir);
                         
                         materializer.computeAndMaterialize(dbEngine.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [ev.session_id]) as any[], sandboxDir).then(() => {
                             if (!activeTerminals.has(ev.session_id)) {
                                 logger.info(`[Sync Daemon] Spawning new PTY terminal for session ${ev.session_id}`);
                                 const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
                                 const ptyProcess = pty.spawn(shell, [], {
                                     name: 'xterm-color',
                                     cols: 80,
                                     rows: 24,
                                     cwd: sandboxDir,
                                     env: process.env as any
                                 });
                                 
                                 terminalBuffers.set(ev.session_id, { buffer: '', timeout: null });
                                 
                                 ptyProcess.onData((data: string) => {
                                     const state = terminalBuffers.get(ev.session_id)!;
                                     state.buffer += data;
                                     if (!state.timeout) {
                                         state.timeout = setTimeout(() => {
                                             dbEngine.appendEvent({
                                                session_id: ev.session_id,
                                                timestamp: Date.now(),
                                                actor: hostName,
                                                type: 'TERMINAL_OUTPUT',
                                                payload: JSON.stringify({ text: state.buffer }),
                                                previous_event_id: null
                                             });
                                             state.buffer = '';
                                             state.timeout = null;
                                         }, 100);
                                     }
                                 });
                                 activeTerminals.set(ev.session_id, ptyProcess);
                             }
                         }).catch((err: any) => logger.error(`[Sync Daemon] Failed to materialize sandbox for PTY: ${err.message}`));
                      }
                   }

                   // Handle Interactive Terminal Input Routing
                   if (ev.type === 'TERMINAL_INPUT') {
                      const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
                      const term = activeTerminals.get(ev.session_id);
                      if (term && (payload.target === hostName || payload.target === 'all')) {
                         term.write(payload.input);
                      }
                   }

                  const message = JSON.stringify({ type: 'event', event: ev });
                  for (const client of clients) {
                     if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                     }
                  }
               }
            }
         }
      } else if (pullRes.status !== 401) {
         logger.error(`[Sync Daemon] Edge Pull Failed: ${pullRes.status}`);
      }
      
   } catch (err: any) {
      if (err.message && err.message.startsWith('AUTH_FATAL:')) {
         logger.error(`[CRITICAL] Authentication Failed: ${err.message.replace('AUTH_FATAL: ', '')}`);
         logger.error(`[CRITICAL] Your Identity Token is invalid or has been revoked. Terminating daemon and clearing local credentials.`);
         const { clearCliToken } = await import('../utils/api');
         clearCliToken();
         process.exit(1);
         return;
      }
      logger.error(`[Sync Daemon] Offline or unreachable: ${err.message}`);
   }
}
