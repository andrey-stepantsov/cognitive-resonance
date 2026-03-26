import { Command } from 'commander';
import { DatabaseEngine, EventRecord } from '../db/DatabaseEngine.js';
import { logger } from '../utils/logger.js';
import { validateProposal } from '@cr/core/src/services/GeminiService.js';
import * as path from 'path';
import { CR_DIR } from '../utils/api.js';

export function registerAuditorCommand(program: Command) {
  program
    .command('serve-auditor')
    .description('Start the local Systems Librarian / Auditor daemon to enforce safety constraints.')
    .action(async (options, command) => {
      const globalOpts = command.parent?.opts() || {};
      const defaultDbPath = path.join(CR_DIR, 'central.sqlite');
      const dbPath = globalOpts.db || program.opts().db || defaultDbPath;
      
      const dbEngine = new DatabaseEngine(dbPath);
      logger.info(`[Auditor] Semantic Librarian daemon initialized. Monitoring ${dbPath}...`);

      const initialMax = dbEngine.get('SELECT max(timestamp) as maxTs FROM events') as { maxTs: number };
      let lastSeenTs = initialMax?.maxTs || 0;
      let coolDownUntil = 0;

      setInterval(async () => {
        if (Date.now() < coolDownUntil) return;

        try {
          const proposals = dbEngine.query(
            "SELECT * FROM events WHERE type = 'ARTEFACT_PROPOSAL' AND timestamp > ? ORDER BY timestamp ASC",
            [lastSeenTs]
          ) as EventRecord[];

          if (proposals.length === 0) return;

          for (const ev of proposals) {
            let payload: any;
            try {
              payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
            } catch (e) {
              // Unparseable, move cursor past it
              lastSeenTs = Math.max(lastSeenTs, ev.timestamp);
              continue;
            }

            if (payload.path && payload.path.startsWith('.cr/skills/')) {
              logger.info(`[Auditor] Auditing skill proposal for ${payload.path} in session ${ev.session_id}`);
              
              const patch = payload.patch || '';
              try {
                 const validationResult = await validateProposal(patch);
                 
                 if (validationResult.isSafe) {
                    logger.info(`[Auditor] ✅ Skill verified safe: ${validationResult.reason}`);
                    dbEngine.appendEvent({
                       session_id: ev.session_id,
                       timestamp: Date.now(),
                       actor: 'SemanticLibrarian',
                       type: 'AI_RESPONSE',
                       payload: JSON.stringify({ nodes: [{ id: 'skill_verified' }] }),
                       previous_event_id: ev.id
                    });
                 } else {
                    logger.warn(`[Auditor] 🛑 Unsafe logic detected: ${validationResult.reason}`);
                    dbEngine.appendEvent({
                       session_id: ev.session_id,
                       timestamp: Date.now(),
                       actor: 'SemanticLibrarian',
                       type: 'AI_RESPONSE',
                       payload: JSON.stringify({ text: `@localuser WARNING: Unsafe logic detected.\nReason: ${validationResult.reason}` }),
                       previous_event_id: ev.id
                    });
                 }
              } catch (apiError: any) {
                 logger.error(`[Auditor] AI Validation failed: ${apiError.message}. Cooling down for 30s to prevent token drain...`);
                 coolDownUntil = Date.now() + 30000;
                 return; // Exit interval and do not advance lastSeenTs, so we retry next time
              }
            }
            
            // Successfully verified or not a skill proposal, advance cursor
            lastSeenTs = Math.max(lastSeenTs, ev.timestamp);
          }
        } catch (err: any) {
          logger.error(`[Auditor] Polling error: ${err.message}`);
        }
      }, 2000);
    });
}
