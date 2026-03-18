import { Command } from 'commander';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine';
import * as http from 'http';

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
        console.log(`[Cognitive Resonance] Local Backend serving on http://localhost:${port}`);
        console.log(`[Cognitive Resonance] WebSocket listening on ws://localhost:${port}`);
        console.log(`[Cognitive Resonance] Using database at ${dbPath}`);
        
        // Start Background Sync Daemon
        const syncIntervalMs = 5000;
        console.log(`[Cognitive Resonance] Starting background Edge Sync daemon (interval: ${syncIntervalMs}ms)`);
        
        setInterval(async () => {
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
                    dbEngine.markEventsSynced(pendingEvents.map(e => e.id));
                    // Intentionally quiet log to avoid spamming the console on every success
                 } else {
                    console.error(`[Sync Daemon] Edge Push Failed: ${res.status} ${res.statusText}`);
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
                 const incomingEvents: EventRecord[] = data.events || [];
                 if (incomingEvents.length > 0) {
                    console.log(`[Sync Daemon] Pulled ${incomingEvents.length} new events from the Edge.`);
                    for (const ev of incomingEvents) {
                       dbEngine.insertRemoteEvent(ev);
                       // Broadcast to connected PWA clients so UI updates in real-time
                       const message = JSON.stringify({ type: 'event', event: ev });
                       for (const client of clients) {
                         if (client.readyState === WebSocket.OPEN) {
                           client.send(message);
                         }
                       }
                    }
                 }
              } else {
                 // Only log pull failures occasionally to prevent terminal noise when offline
                 if (Math.random() < 0.05) console.error(`[Sync Daemon] Edge Pull Failed: ${pullRes.status}`);
              }
              
           } catch (err: any) {
              // Network unreachable or other fatal fetch error
              if (Math.random() < 0.02) console.error(`[Sync Daemon] Offline or unreachable: ${err.message}`);
           }
        }, syncIntervalMs);
      });
    });
}
