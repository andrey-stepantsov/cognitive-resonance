import { Command } from 'commander';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine.js';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { Materializer } from '@cr/core/src/services/Materializer.js';
import { IoAdapter, DefaultIoAdapter } from '../utils/IoAdapter.js';

export function registerObserveCommands(program: Command, io: IoAdapter = new DefaultIoAdapter()) {
  program
    .command('turns [sessionId]')
    .description('Retrieve the raw interaction history (turns) for a session')
    .option('-d, --db <path>', 'Database path', 'cr.sqlite')
    .action(async (sessionId, options) => {
      const db = new DatabaseEngine(options.db);
      if (!sessionId) {
        listSessions(db, io);
        db.close();
        return;
      }
      
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as EventRecord[];
      if (events.length === 0) {
        io.print(`No events found for session: ${sessionId}`);
        db.close();
        return;
      }

      printTurns(events, io);
      db.close();
    });

  program
    .command('head <sessionId>')
    .description('Retrieve the first interactive turns of a session')
    .option('-n, --lines <number>', 'Number of turns to show', '10')
    .option('-d, --db <path>', 'Database path', 'cr.sqlite')
    .action((sessionId, options) => {
      const db = new DatabaseEngine(options.db);
      const limit = parseInt(options.lines, 10) * 2; // roughly 2 events per turn (USER, AI)
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?', [sessionId, limit]) as EventRecord[];
      printTurns(events, io);
      db.close();
    });

  program
    .command('tail <sessionId>')
    .description('Retrieve the last interactive turns of a session')
    .option('-n, --lines <number>', 'Number of turns to show', '10')
    .option('-d, --db <path>', 'Database path', 'cr.sqlite')
    .action((sessionId, options) => {
      const db = new DatabaseEngine(options.db);
      const limit = parseInt(options.lines, 10) * 2;
      const events = db.query(`
        SELECT * FROM (
          SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
        ) ORDER BY timestamp ASC
      `, [sessionId, limit]) as EventRecord[];
      printTurns(events, io);
      db.close();
    });

  program
    .command('follow [sessionId]')
    .description('Observe and follow a session live as events stream in')
    .option('-d, --db <path>', 'Database path', 'cr.sqlite')
    .action(async (sessionId, options) => {
      const db = new DatabaseEngine(options.db);
      
      let targetSession = sessionId;
      if (!targetSession) {
         const latestObj = db.get('SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1') as { session_id: string } | undefined;
         if (!latestObj) {
            io.print('No sessions found.');
            return;
         }
         targetSession = latestObj.session_id;
      }
      
      io.print(`Watching session ${targetSession}... (Press Ctrl+C to stop)`);
      
      // Print historical context tail first
      const tailLimit = 10;
      let events = db.query(`
        SELECT * FROM (
          SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
        ) ORDER BY timestamp ASC
      `, [targetSession, tailLimit]) as EventRecord[];
      
      if (events.length > 0) printTurns(events, io);
      else io.print(`No prior history.`);

      let lastTimestamp = events.length > 0 ? events[events.length - 1].timestamp : 0;

      // Enter polling loop
      io.setInterval(() => {
        const newEvents = db.query('SELECT * FROM events WHERE session_id = ? AND timestamp > ? ORDER BY timestamp ASC', [targetSession, lastTimestamp]) as EventRecord[];
        
        if (newEvents.length > 0) {
          printTurns(newEvents, io);
          lastTimestamp = newEvents[newEvents.length - 1].timestamp;
        }
      }, 500);

      // We do not close db here because setInterval runs indefinitely until Ctrl+C
    });

  program
    .command('logs [sessionId]')
    .description('Observe and follow live execution logs for a session')
    .option('-d, --db <path>', 'Database path', '.cr/central.sqlite')
    .action(async (sessionId, options, command) => {
      const dbPath = options.db !== '.cr/central.sqlite' ? options.db : (command.parent?.opts().db || options.db);
      const db = new DatabaseEngine(dbPath);
      
      let targetSession = sessionId;
      if (!targetSession) {
         const latestObj = db.get('SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1') as { session_id: string } | undefined;
         if (!latestObj) {
            io.print('No sessions found.');
            return;
         }
         targetSession = latestObj.session_id;
      }
      
      io.print(`Watching execution logs for session ${targetSession}... (Press Ctrl+C to stop)`);
      
      const tailLimit = 20;
      let events = db.query(`
        SELECT * FROM (
          SELECT * FROM events WHERE session_id = ? AND type IN ('RUNTIME_OUTPUT', 'TERMINAL_OUTPUT') ORDER BY timestamp DESC LIMIT ?
        ) ORDER BY timestamp ASC
      `, [targetSession, tailLimit]) as EventRecord[];
      
      if (events.length > 0) printTurns(events, io);
      else io.print(`No prior execution logs.`);

      let lastTimestamp = events.length > 0 ? events[events.length - 1].timestamp : 0;

      io.setInterval(() => {
        const newEvents = db.query(`SELECT * FROM events WHERE session_id = ? AND timestamp > ? AND type IN ('RUNTIME_OUTPUT', 'TERMINAL_OUTPUT') ORDER BY timestamp ASC`, [targetSession, lastTimestamp]) as EventRecord[];
        
        if (newEvents.length > 0) {
          printTurns(newEvents, io);
          lastTimestamp = newEvents[newEvents.length - 1].timestamp;
        }
      }, 500);
    });

  program
    .command('audit [sessionId]')
    .description('Audit the event graph for causal contiguity and payload validity')
    .option('-d, --db <path>', 'Database path', '.cr/central.sqlite')
    .action((sessionId, options, command) => {
      const defaultDbPath = '.cr/central.sqlite';
      const dbPath = options.db !== defaultDbPath ? options.db : (command.parent?.opts().db || options.db);
      const db = new DatabaseEngine(dbPath);
      
      let targetSession = sessionId;
      if (!targetSession) {
         const latestObj = db.get('SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1') as { session_id: string } | undefined;
         if (!latestObj) {
            io.print(chalk.red('No sessions found in the database.'));
            return;
         }
         targetSession = latestObj.session_id;
      }

      io.print(chalk.blue(`\nAuditing Session: ${targetSession}\n`));

      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [targetSession]) as EventRecord[];
      
      if (events.length === 0) {
        io.print(chalk.yellow('No events found for this session.'));
        return;
      }

      const table = new Table({
        head: [chalk.cyan('ID (short)'), chalk.cyan('Type'), chalk.cyan('Actor'), chalk.cyan('Contiguous?'), chalk.cyan('Valid JSON?')]
      });

      let orphanedCount = 0;
      let invalidJsonCount = 0;
      const eventIds = new Set<string>();

      let mermaidGraph = 'graph TD;\\n';

      for (const ev of events) {
        eventIds.add(ev.id);
        
        let isContiguous = true;
        if (ev.previous_event_id && !eventIds.has(ev.previous_event_id)) {
           const exists = db.get('SELECT id FROM events WHERE id = ?', [ev.previous_event_id]);
           if (!exists) {
              isContiguous = false;
              orphanedCount++;
           }
        }

        let isValidJson = true;
        try {
           if (typeof ev.payload === 'string') {
               JSON.parse(ev.payload);
           }
        } catch (e) {
           isValidJson = false;
           invalidJsonCount++;
        }

        const shortId = ev.id.substring(0, 8);
        const shortPrevId = ev.previous_event_id ? ev.previous_event_id.substring(0, 8) : null;
        
        table.push([
           shortId,
           ev.type,
           ev.actor,
           isContiguous ? chalk.green('Yes') : chalk.red('No (Orphaned)'),
           isValidJson ? chalk.green('Yes') : chalk.red('No')
        ]);

        if (shortPrevId) {
            mermaidGraph += `  ${shortPrevId} -->|${ev.type}| ${shortId};\\n`;
        } else {
            mermaidGraph += `  ROOT -->|${ev.type}| ${shortId};\\n`;
        }
      }

      io.print(table.toString());

      io.print(chalk.magenta('\\n=== Mermaid Graph ===\\n'));
      io.print(mermaidGraph);
      io.print(chalk.magenta('=====================\\n'));

      if (orphanedCount === 0 && invalidJsonCount === 0) {
         io.print(chalk.green.bold('Audit Passed: Graph is mathematically contiguous and payloads are valid.\\n'));
      } else {
         io.print(chalk.red.bold(`Audit Failed: Found ${orphanedCount} temporal paradoxes and ${invalidJsonCount} invalid payloads.\\n`));
      }

      db.close();
    });

  program
    .command('status')
    .description('Compute virtual state differences against the physical directory')
    .option('-d, --db <path>', 'Database path', '.cr/central.sqlite')
    .action(async (options, command) => {
      const dbPath = options.db !== '.cr/central.sqlite' ? options.db : (command.parent?.opts().db || options.db);
      const db = new DatabaseEngine(dbPath);
      
      const latestObj = db.get('SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1') as { session_id: string } | undefined;
      if (!latestObj) {
         io.print(chalk.yellow('No events found, nothing to diff.'));
         return;
      }
      const sessionId = latestObj.session_id;
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as EventRecord[];
      
      const materializer = new Materializer(process.cwd());
      io.print(chalk.blue(`\\nComputing virtual state for session ${sessionId}...\\n`));
      
      const vfs = materializer.computeVirtualState(events);
      
      const table = new Table({
        head: [chalk.cyan('File Path'), chalk.cyan('Status')]
      });

      let diffCount = 0;

      for (const [vPath, vContent] of vfs.entries()) {
         const physPath = path.join(process.cwd(), vPath);
         let exists = false;
         let pContent = '';
         try {
            exists = fs.existsSync(physPath);
            if (exists) pContent = fs.readFileSync(physPath, 'utf8');
         } catch (e) {}

         if (!exists) {
            table.push([vPath, chalk.green('Pending Create (Virtual Only)')]);
            diffCount++;
         } else if (pContent !== vContent) {
            table.push([vPath, chalk.yellow('Modified (Drift)')]);
            diffCount++;
         }
      }

      for (const ev of events) {
         if (ev.type === 'FILE_DELETED' || ev.type === 'PWA_DELETE') {
            try {
               const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
               const target = payload.path || payload.target;
               if (target) {
                  const physPath = path.join(process.cwd(), target);
                  if (fs.existsSync(physPath) && !vfs.has(target)) {
                     table.push([target, chalk.red('Pending Delete (Exists Physically)')]);
                     diffCount++;
                  }
               }
            } catch (e) {}
         }
      }

      if (diffCount === 0) {
         io.print(chalk.green('Virtual state is strictly identical to physical state. No drift.'));
      } else {
         io.print(table.toString());
      }

      db.close();
    });

  program
    .command('ls [sessionId]')
    .description('Print the virtual workspace tree')
    .option('-d, --db <path>', 'Database path', '.cr/central.sqlite')
    .action(async (sessionId, options, command) => {
      const dbPath = options.db !== '.cr/central.sqlite' ? options.db : (command.parent?.opts().db || options.db);
      const db = new DatabaseEngine(dbPath);
      
      let targetSession = sessionId;
      if (!targetSession) {
         const latestObj = db.get('SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1') as { session_id: string } | undefined;
         if (!latestObj) {
            io.print(chalk.yellow('No events found.'));
            return;
         }
         targetSession = latestObj.session_id;
      }
      
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [targetSession]) as EventRecord[];
      const materializer = new Materializer(process.cwd());
      
      io.print(chalk.blue(`\nVirtual Workspace Tree for session ${targetSession}\n`));
      const vfs = materializer.computeVirtualState(events);
      
      const filePaths = Array.from(vfs.keys()).sort();
      
      if (filePaths.length === 0) {
         io.print(chalk.gray('(Empty virtual workspace)'));
      } else {
         interface TreeNode {
             children: Record<string, TreeNode>;
             isFile: boolean;
         }
         const root: TreeNode = { children: {}, isFile: false };

         for (const fp of filePaths) {
             const parts = fp.split('/');
             let current = root;
             for (let i = 0; i < parts.length; i++) {
                 const part = parts[i];
                 if (!current.children[part]) {
                     current.children[part] = { children: {}, isFile: i === parts.length - 1 };
                 }
                 current = current.children[part];
             }
         }

         const printTree = (node: TreeNode, prefix: string) => {
             const entries = Object.entries(node.children).sort(([aK, aV], [bK, bV]) => {
                 // directories first
                 if (aV.isFile && !bV.isFile) return 1;
                 if (!aV.isFile && bV.isFile) return -1;
                 return aK.localeCompare(bK);
             });

             for (let i = 0; i < entries.length; i++) {
                 const [name, childNode] = entries[i];
                 const isLast = i === entries.length - 1;
                 const connector = isLast ? '└── ' : '├── ';
                 const prefixExt = isLast ? '    ' : '│   ';
                 
                 const coloredName = childNode.isFile ? chalk.green(name) : chalk.cyan(name);
                 io.print(`${prefix}${connector}${coloredName}`);
                 
                 if (!childNode.isFile) {
                     printTree(childNode, prefix + prefixExt);
                 }
             }
         };

         io.print(chalk.cyan('.'));
         printTree(root, '');
         io.print(`\n${filePaths.length} virtual files/directories`);
      }

      db.close();
    });
}

function listSessions(db: DatabaseEngine, io: IoAdapter) {
  io.print('Available Sessions:');
  const sessionIds = db.query('SELECT DISTINCT session_id FROM events ORDER BY timestamp DESC');
  for (const row of sessionIds) {
    io.print(`  - ${row.session_id}`);
  }
}

function printTurns(events: EventRecord[], io: IoAdapter) {
  for (const ev of events) {
    if (ev.type === 'USER_PROMPT') {
      try {
        const payload = JSON.parse(ev.payload);
        io.print(`\x1b[36m[${ev.actor}]\x1b[0m: ${payload.text}`);
      } catch (e) {
        io.print(`\x1b[36m[${ev.actor}]\x1b[0m: [Unparseable User Data]`);
      }
    } else if (ev.type === 'AI_RESPONSE') {
      try {
        const payload = JSON.parse(ev.payload);
        io.print(`\x1b[33m[${ev.actor}]\x1b[0m (Dissonance: ${payload.dissonance}): ${payload.text}`);
      } catch (e) {
         io.print(`\x1b[33m[${ev.actor}]\x1b[0m: [Unparseable AI Data]`);
      }
    } else if (ev.type === 'RUNTIME_OUTPUT' || ev.type === 'TERMINAL_OUTPUT') {
      try {
        const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
        const color = ev.type === 'RUNTIME_OUTPUT' ? '\x1b[35m' : '\x1b[32m'; // Magenta for Runtime, Green for Terminal
        io.print(`${color}[${ev.actor} - ${ev.type}]\x1b[0m\n${payload.text}`);
      } catch (e) {
        io.print(`\x1b[35m[${ev.actor} - ${ev.type}]\x1b[0m: [Unparseable Output Data]`);
      }
    } else {
        // Fallback for metadata events like PWA configuration chunks
        io.print(`\x1b[90m[System Event]\x1b[0m ${ev.type} @ ${ev.timestamp}`);
    }
  }
}
