import { Command } from 'commander';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { Materializer } from '@cr/core/src/services/Materializer';

export function registerObserveCommands(program: Command) {
  program
    .command('turns [sessionId]')
    .description('Retrieve the raw interaction history (turns) for a session')
    .option('-d, --db <path>', 'Database path', 'cr.sqlite')
    .action(async (sessionId, options) => {
      const db = new DatabaseEngine(options.db);
      if (!sessionId) {
        listSessions(db);
        db.close();
        return;
      }
      
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as EventRecord[];
      if (events.length === 0) {
        console.log(`No events found for session: ${sessionId}`);
        db.close();
        return;
      }

      printTurns(events);
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
      printTurns(events);
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
      printTurns(events);
      db.close();
    });

  program
    .command('follow <sessionId>')
    .description('Observe and follow a session live as events stream in')
    .option('-d, --db <path>', 'Database path', 'cr.sqlite')
    .action(async (sessionId, options) => {
      const db = new DatabaseEngine(options.db);
      
      console.log(`Watching session ${sessionId}... (Press Ctrl+C to stop)`);
      
      // Print historical context tail first
      const tailLimit = 10;
      let events = db.query(`
        SELECT * FROM (
          SELECT * FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
        ) ORDER BY timestamp ASC
      `, [sessionId, tailLimit]) as EventRecord[];
      
      if (events.length > 0) printTurns(events);
      else console.log(`No prior history.`);

      let lastTimestamp = events.length > 0 ? events[events.length - 1].timestamp : 0;

      // Enter polling loop
      setInterval(() => {
        const newEvents = db.query('SELECT * FROM events WHERE session_id = ? AND timestamp > ? ORDER BY timestamp ASC', [sessionId, lastTimestamp]) as EventRecord[];
        
        if (newEvents.length > 0) {
          printTurns(newEvents);
          lastTimestamp = newEvents[newEvents.length - 1].timestamp;
        }
      }, 500);

      // We do not close db here because setInterval runs indefinitely until Ctrl+C
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
            console.log(chalk.red('No sessions found in the database.'));
            return;
         }
         targetSession = latestObj.session_id;
      }

      console.log(chalk.blue(`\nAuditing Session: ${targetSession}\n`));

      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [targetSession]) as EventRecord[];
      
      if (events.length === 0) {
        console.log(chalk.yellow('No events found for this session.'));
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

      console.log(table.toString());

      console.log(chalk.magenta('\\n=== Mermaid Graph ===\\n'));
      console.log(mermaidGraph);
      console.log(chalk.magenta('=====================\\n'));

      if (orphanedCount === 0 && invalidJsonCount === 0) {
         console.log(chalk.green.bold('Audit Passed: Graph is mathematically contiguous and payloads are valid.\\n'));
      } else {
         console.log(chalk.red.bold(`Audit Failed: Found ${orphanedCount} temporal paradoxes and ${invalidJsonCount} invalid payloads.\\n`));
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
         console.log(chalk.yellow('No events found, nothing to diff.'));
         return;
      }
      const sessionId = latestObj.session_id;
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as EventRecord[];
      
      const materializer = new Materializer(process.cwd());
      console.log(chalk.blue(`\\nComputing virtual state for session ${sessionId}...\\n`));
      
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
         console.log(chalk.green('Virtual state is strictly identical to physical state. No drift.'));
      } else {
         console.log(table.toString());
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
            console.log(chalk.yellow('No events found.'));
            return;
         }
         targetSession = latestObj.session_id;
      }
      
      const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [targetSession]) as EventRecord[];
      const materializer = new Materializer(process.cwd());
      
      console.log(chalk.blue(`\nVirtual Workspace Tree for session ${targetSession}\n`));
      const vfs = materializer.computeVirtualState(events);
      
      const filePaths = Array.from(vfs.keys()).sort();
      
      if (filePaths.length === 0) {
         console.log(chalk.gray('(Empty virtual workspace)'));
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
                 console.log(`${prefix}${connector}${coloredName}`);
                 
                 if (!childNode.isFile) {
                     printTree(childNode, prefix + prefixExt);
                 }
             }
         };

         console.log(chalk.cyan('.'));
         printTree(root, '');
         console.log(`\n${filePaths.length} virtual files/directories`);
      }

      db.close();
    });
}

function listSessions(db: DatabaseEngine) {
  console.log('Available Sessions:');
  const sessionIds = db.query('SELECT DISTINCT session_id FROM events ORDER BY timestamp DESC');
  for (const row of sessionIds) {
    console.log(`  - ${row.session_id}`);
  }
}

function printTurns(events: EventRecord[]) {
  for (const ev of events) {
    if (ev.type === 'USER_PROMPT') {
      try {
        const payload = JSON.parse(ev.payload);
        console.log(`\x1b[36m[${ev.actor}]\x1b[0m: ${payload.text}`);
      } catch (e) {
        console.log(`\x1b[36m[${ev.actor}]\x1b[0m: [Unparseable User Data]`);
      }
    } else if (ev.type === 'AI_RESPONSE') {
      try {
        const payload = JSON.parse(ev.payload);
        console.log(`\x1b[33m[${ev.actor}]\x1b[0m (Dissonance: ${payload.dissonance}): ${payload.text}`);
      } catch (e) {
         console.log(`\x1b[33m[${ev.actor}]\x1b[0m: [Unparseable AI Data]`);
      }
    } else {
        // Fallback for metadata events like PWA configuration chunks
        console.log(`\x1b[90m[System Event]\x1b[0m ${ev.type} @ ${ev.timestamp}`);
    }
  }
}
