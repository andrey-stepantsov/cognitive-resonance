import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerPortabilityCommands } from '../commands/portability';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseEngine } from '../db/DatabaseEngine';

describe('E2E: Portability Commands (Pack / Unpack)', () => {
    let program: Command;
    let consoleLog: any;
    let consoleError: any;
    const testDbPath = path.join(__dirname, 'test-portability.sqlite');
    const testBundlePath = path.join(__dirname, 'bundle-testEntity.json');

    beforeEach(() => {
        vi.clearAllMocks();
        consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        program = new Command();
        registerPortabilityCommands(program);

        vi.spyOn(process, 'exit').mockImplementation((code: any) => {
            throw new Error(`MOCKED_PROCESS_EXIT_CODE_${code}`);
        });

        // Initialize a mock DB and add a mock entity
        const db = new DatabaseEngine(testDbPath);
        db.getDb().prepare(`INSERT INTO entities (id, name, latest_artefact_id, previous_artefact_id) VALUES (?, ?, ?, ?)`).run('ent-1', 'testEntity', 'art-1', null);
        db.getDb().prepare(`INSERT INTO artefacts (id, source_session_id, source_event_id, type, content, version) VALUES (?, ?, ?, ?, ?, ?)`).run('art-1', 'session-1', 'event-1', 'code', 'some content', 1);
        db.getDb().prepare(`INSERT INTO sessions (id, owner_id, head_event_id) VALUES (?, ?, ?)`).run('session-1', 'owner-1', 'event-1');
        db.getDb().prepare(`INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('event-1', 'session-1', 12345, 'actor-1', 'code', 'payload', null);
        db.close();
    });

    afterEach(() => {
        try { fs.unlinkSync(testDbPath); } catch(e) {}
        try { fs.unlinkSync(testBundlePath); } catch(e) {}
        vi.restoreAllMocks();
    });

    it(' successfully packs an existing entity into a JSON bundle', async () => {
        await program.parseAsync(['node', 'cr', 'pack', 'testEntity', testBundlePath, '-d', testDbPath]);
        expect(consoleLog).toHaveBeenCalledWith(`Packed entity testEntity into ${testBundlePath}`);
        
        const fileContent = fs.readFileSync(testBundlePath, 'utf8');
        const bundle = JSON.parse(fileContent);
        expect(bundle.entities.length).toBe(1);
        expect(bundle.artefacts.length).toBe(1);
        expect(bundle.sessions.length).toBe(1);
        expect(bundle.events.length).toBe(1);
    });

    it(' handles packing a non-existent entity with an error code', async () => {
        let err;
        try {
            await program.parseAsync(['node', 'cr', 'pack', 'missingEntity', testBundlePath, '-d', testDbPath]);
        } catch(e) {
            err = e;
        }
        expect(err?.message).toBe('MOCKED_PROCESS_EXIT_CODE_1');
        expect(consoleError).toHaveBeenCalledWith('Entity not found: missingEntity');
    });

    it(' successfully unpacks a valid bundle into the database', async () => {
        const dummyDbPath = path.join(__dirname, 'dummy-unpack.sqlite');
        try { fs.unlinkSync(dummyDbPath); } catch(e) {}
        
        // Ensure dummy DB is initialized
        const setupDb = new DatabaseEngine(dummyDbPath);
        setupDb.close();

        // Pack first
        await program.parseAsync(['node', 'cr', 'pack', 'testEntity', testBundlePath, '-d', testDbPath]);
        
        // Unpack into dummy DB
        await program.parseAsync(['node', 'cr', 'unpack', testBundlePath, '-d', dummyDbPath]);
        
        // Assert it unpacked successfully
        expect(consoleLog).toHaveBeenCalledWith(`Unpacked bundle ${testBundlePath} successfully.`);
        
        const verifyDb = new DatabaseEngine(dummyDbPath);
        const entity = verifyDb.getEntityByName('testEntity');
        expect(entity).not.toBeNull();
        expect(entity?.id).toBe('ent-1');
        verifyDb.close();
        
        try { fs.unlinkSync(dummyDbPath); } catch(e) {}
    });
});
