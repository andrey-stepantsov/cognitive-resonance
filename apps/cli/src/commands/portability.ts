import { Command } from 'commander';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { readFileSync, writeFileSync } from 'fs';

export function registerPortabilityCommands(program: Command) {
  program.command('pack <entityName> [outJson]')
    .option('-d, --db <path>', 'Path to SQLite database', 'test.sqlite')
    .action((entityName, outJson, options) => {
        const db = new DatabaseEngine(options.db);
        const entity = db.getEntityByName(entityName) as any;
        if (!entity) {
             console.error(`Entity not found: ${entityName}`);
             process.exit(1);
        }
        const bundle = {
            entities: [entity],
            artefacts: [] as any[],
            sessions: [] as any[],
            events: [] as any[]
        };

        const artefact = db.getArtefact(entity.latest_artefact_id) as any;
        if (artefact) {
            bundle.artefacts.push(artefact);

            const session = db.get('SELECT * FROM sessions WHERE id = ?', [artefact.source_session_id]) as any;
            if (session) bundle.sessions.push(session);

            const events = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [artefact.source_session_id]);
            bundle.events.push(...events);
        }

        const outFile = outJson || `bundle-${entityName.replace(/[^a-z0-9]/gi, '_')}.json`;
        writeFileSync(outFile, JSON.stringify(bundle, null, 2));
        console.log(`Packed entity ${entityName} into ${outFile}`);
        db.close();
    });

  program.command('unpack <bundleJson>')
    .option('-d, --db <path>', 'Path to SQLite database', 'test.sqlite')
    .action((bundleJson, options) => {
        const bundleStr = readFileSync(bundleJson, 'utf8');
        const bundle = JSON.parse(bundleStr);
        const db = new DatabaseEngine(options.db);
        
        for (const s of bundle.sessions || []) {
            try { db.getDb().prepare('INSERT INTO sessions (id, owner_id, head_event_id) VALUES (?, ?, ?)').run(s.id, s.owner_id, s.head_event_id); } catch(e){}
        }
        for (const e of bundle.events || []) {
            try { db.getDb().prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(e.id, e.session_id, e.timestamp, e.actor, e.type, e.payload, e.previous_event_id); } catch(e){}
        }
        for (const a of bundle.artefacts || []) {
            try { db.getDb().prepare(`INSERT INTO artefacts (id, source_session_id, source_event_id, type, content, version) VALUES (?, ?, ?, ?, ?, ?)`).run(a.id, a.source_session_id, a.source_event_id, a.type, a.content, a.version); } catch(e){}
        }
        for (const ent of bundle.entities || []) {
            try { 
                db.getDb().prepare(`INSERT INTO entities (id, name, latest_artefact_id, previous_artefact_id) VALUES (?, ?, ?, ?)`).run(ent.id, ent.name, ent.latest_artefact_id, ent.previous_artefact_id); 
            } catch(e) {
                db.getDb().prepare(`UPDATE entities SET latest_artefact_id = ? WHERE name = ?`).run(ent.latest_artefact_id, ent.name);
            }
        }

        console.log(`Unpacked bundle ${bundleJson} successfully.`);
        db.close();
    });
}
