import { Command } from 'commander';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine';
import * as http from 'http';
import { logger } from '../utils/logger';
import chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { ArtefactManager, GitContextManager } from '@cr/core';

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

  app.post('/api/events', (req, res) => {
    try {
      const event: EventRecord = req.body;
      const id = dbEngine.appendEvent(event);
      
      const eventRecord = dbEngine.get('SELECT * FROM events WHERE id = ?', [id]);
      broadcastEvent(eventRecord);
      
      res.json({ id });
    } catch (err: any) {
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

  return app;
}

export function registerServeCommand(program: Command) {
  program
    .command('serve')
    .description('Start a local HTTP/WebSocket event-sourced server for the monorepo')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .action((options, command) => {
      const globalOpts = command.parent?.opts() || {};
      const dbPath = globalOpts.db || 'cr.sqlite';
      
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
        
        // Initialize File Watcher
        const artefactManager = new ArtefactManager('local-session', fs, process.cwd());
        
        const watcher = chokidar.watch(process.cwd(), {
          ignored: [/(^|[\/\\])\../, /node_modules/, /dist/, /build/, /\.cr-cli-token/, /cr\.sqlite.*/],
          persistent: true,
          ignoreInitial: true
        });

        watcher.on('change', async (filepath) => {
          try {
            const relativePath = path.relative(process.cwd(), filepath);
            const content = fs.readFileSync(filepath, 'utf8');
            const sha = await artefactManager.commitDirect(relativePath, content, 'Local Development');
            
            const headId = dbEngine.get('SELECT head_event_id FROM sessions WHERE id = ?', ['local-session'])?.head_event_id || null;
            
            const eventId = dbEngine.appendEvent({
              session_id: 'local-session',
              timestamp: Date.now(),
              actor: 'Local Development',
              type: 'MANUAL_OVERRIDE',
              payload: JSON.stringify({ filepath: relativePath, sha }),
              previous_event_id: headId
            });
            
            const eventRecord = dbEngine.get('SELECT * FROM events WHERE id = ?', [eventId]);
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'event', event: eventRecord }));
              }
            }
            logger.info(`[Sync Daemon] Watched file changed: ${relativePath}, committed as ${sha}`);
          } catch (err: any) {
            logger.error(`[Sync Daemon] Failed to process file change ${filepath}: ${err.message}`);
          }
        });

        logger.info(`[Cognitive Resonance] File watcher initialized for ${process.cwd()}`);

        // Start Background Sync Daemon
        const syncIntervalMs = 5000;
        logger.info(`[Cognitive Resonance] Starting background Edge Sync daemon (interval: ${syncIntervalMs}ms)`);
        
        setInterval(() => runSyncDaemon(dbEngine, clients, logger), syncIntervalMs);
      });
    });
}

export async function runSyncDaemon(dbEngine: DatabaseEngine, clients: Set<WebSocket>, logger: any) {
   try {
      const fs = require('fs');
      const path = require('path');
      const TOKEN_FILE_PATH = path.resolve(process.cwd(), '.cr-cli-token');
      
      let token: string | null = null;
      if (fs.existsSync(TOKEN_FILE_PATH)) {
         token = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8').trim();
      }
      
      const backendUrl = process.env.VITE_CLOUDFLARE_WORKER_URL || process.env.CR_CLOUD_URL || 'http://localhost:8787';
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
         } else {
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
         const incomingEvents: any[] = data.events || [];
         if (incomingEvents.length > 0) {
            logger.info(`[Sync Daemon] Pulled ${incomingEvents.length} new events from the Edge.`);
            for (const ev of incomingEvents) {
               let conflict = false;
               if (ev.type === 'MANUAL_OVERRIDE' || ev.type === 'ARTEFACT_PROMOTED') {
                  const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
                  const filepath = payload.filepath;
                  
                  if (filepath) {
                     const gitManager = new GitContextManager(ev.session_id, fs, process.cwd());
                     const statusMatrix = await gitManager.getStatusMatrix();
                     
                     // status format: [filepath, HEAD, WORKDIR, STAGE]
                     // WORKDIR: 0 = absent, 1 = identical, 2 = modified
                     const fileStatus = statusMatrix.find((row) => row[0] === filepath);
                     if (fileStatus && fileStatus[1] === 1 && fileStatus[2] === 2) {
                        conflict = true;
                     }
                  }
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
                  const message = JSON.stringify({ type: 'event', event: ev });
                  for (const client of clients) {
                     if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                     }
                  }
               }
            }
         }
      } else {
         if (Math.random() < 0.05) logger.error(`[Sync Daemon] Edge Pull Failed: ${pullRes.status}`);
      }
      
   } catch (err: any) {
      if (Math.random() < 0.02) logger.error(`[Sync Daemon] Offline or unreachable: ${err.message}`);
   }
}
