import { Command } from 'commander';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine';

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
