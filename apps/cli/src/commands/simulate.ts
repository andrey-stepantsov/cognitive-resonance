import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { DatabaseEngine } from '../db/DatabaseEngine.js';
import crypto from 'crypto';

export function registerSimulateCommand(program: Command) {
  program
    .command('simulate <scenario-file>')
    .description('Run a deterministic event-sourced simulation scenario')
    .option('-d, --db <path>', 'Path to SQLite database', 'test.sqlite')
    .action((scenarioFile, options) => {
        const scenarioStr = readFileSync(scenarioFile, 'utf8');
        const scenario = JSON.parse(scenarioStr);
        
        const db = new DatabaseEngine(options.db);
        
        console.log(`Starting simulation: ${scenario.name}`);
        let currentSessionId = '';
        let lastEventId: string | null = null;
        
        for (const ev of scenario.events) {
            if (ev.type === 'SESSION_CREATED') {
                currentSessionId = ev.id || crypto.randomUUID();
                db.createSession(ev.actor, currentSessionId);
            } else if (ev.type === 'USER_ACTION' || ev.type === 'AI_ACTION') {
                const eventId = db.appendEvent({
                    id: ev.id || crypto.randomUUID(),
                    session_id: currentSessionId,
                    timestamp: ev.timestamp,
                    actor: ev.actor,
                    type: ev.type,
                    payload: typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload),
                    previous_event_id: ev.previous_event_id || lastEventId
                });
                lastEventId = eventId;
                
                if (ev.produces_artefact) {
                    const artId = db.createArtefact(
                        currentSessionId, 
                        eventId, 
                        ev.produces_artefact.type, 
                        typeof ev.produces_artefact.content === 'string' ? ev.produces_artefact.content : JSON.stringify(ev.produces_artefact.content), 
                        ev.produces_artefact.version || 1, 
                        ev.produces_artefact.id
                    );
                    
                    if (ev.promotes_entity) {
                        db.promoteEntity(ev.promotes_entity, artId, ev.entity_id);
                    }
                }
            } else if (ev.type === 'USER_REGISTERED') {
                 const userId = ev.payload.id || crypto.randomUUID();
                 db.upsertUser({
                     id: userId,
                     email: ev.payload.email,
                     nick: ev.payload.nick,
                     password_hash: ev.payload.password_hash,
                     status: 'active'
                 });
                 db.createSession('SYSTEM', 'system-session');
                 const eventId = db.appendEvent({
                     id: ev.id || crypto.randomUUID(),
                     session_id: 'system-session',
                     timestamp: ev.timestamp,
                     actor: ev.actor || 'SYSTEM',
                     type: ev.type,
                     payload: JSON.stringify(ev.payload),
                     previous_event_id: lastEventId
                 });
                 lastEventId = eventId;
            } else if (ev.type === 'USER_SUSPENDED' || ev.type === 'PASSWORD_UPDATED' || ev.type === 'NICK_UPDATED') {
                 const u = db.getUserById(ev.payload.userId);
                 if (u) {
                     if (ev.type === 'USER_SUSPENDED') u.status = 'suspended';
                     if (ev.type === 'PASSWORD_UPDATED') u.password_hash = ev.payload.password_hash;
                     if (ev.type === 'NICK_UPDATED') u.nick = ev.payload.nick;
                     db.upsertUser(u);
                 }
                 const eventId = db.appendEvent({
                     id: ev.id || crypto.randomUUID(),
                     session_id: 'system-session',
                     timestamp: ev.timestamp,
                     actor: ev.actor || 'SYSTEM',
                     type: ev.type,
                     payload: JSON.stringify(ev.payload),
                     previous_event_id: lastEventId
                 });
                 lastEventId = eventId;
            }
        }
        db.close();
        console.log('Simulation complete.');
    });
}
