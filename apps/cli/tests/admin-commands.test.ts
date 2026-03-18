import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Command } from 'commander';
import { registerUserCommands } from '../src/commands/user';
import { registerSimulateCommand } from '../src/commands/simulate';
import { registerAssertCommand } from '../src/commands/assert';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as fs from 'fs';
import * as path from 'path';

describe('Admin CLI Commands: User, Simulate, Assert', () => {
    const testDir = path.join(__dirname, 'admin-test-temp');
    const dbPath = path.join(testDir, 'admin.sqlite');

    beforeAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should test user management commands', async () => {
        const program = new Command();
        registerUserCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Register
        await program.parseAsync(['node', 'cr.js', 'user', 'register', 'test@test.com', 'testy', 'pass', '-d', dbPath]);
        
        // Ensure user exists
        const db = new DatabaseEngine(dbPath);
        let u = db.getUserByEmail('test@test.com');
        expect(u).toBeDefined();
        
        // Update Nick
        await program.parseAsync(['node', 'cr.js', 'user', 'set-nick', u!.id, 'newNick', '-d', dbPath]);
        u = db.getUserByEmail('test@test.com');
        expect(u?.nick).toBe('newNick');

        // Update Password
        await program.parseAsync(['node', 'cr.js', 'user', 'set-password', u!.id, 'newPass', '-d', dbPath]);
        u = db.getUserByEmail('test@test.com');
        expect(u?.password_hash).toBe('newPass');

        // Suspend
        await program.parseAsync(['node', 'cr.js', 'user', 'suspend', u!.id, '-d', dbPath]);
        u = db.getUserByEmail('test@test.com');
        expect(u?.status).toBe('suspended');

        // Test non-existent user errors
        await program.parseAsync(['node', 'cr.js', 'user', 'suspend', 'bad-id', '-d', dbPath]);
        await program.parseAsync(['node', 'cr.js', 'user', 'set-nick', 'bad-id', 'nick', '-d', dbPath]);
        await program.parseAsync(['node', 'cr.js', 'user', 'set-password', 'bad-id', 'pass', '-d', dbPath]);

        db.close();
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    it('should run deterministic event simulation', async () => {
        const scenario = {
            name: 'e2e-simulation',
            events: [
                { type: 'SESSION_CREATED', actor: 'SYSTEM' },
                { type: 'USER_ACTION', actor: 'USER', timestamp: Date.now(), payload: 'Hello', produces_artefact: { type: 'CODE', content: 'test', id: 'art1' }, promotes_entity: 'testEnt', entity_id: 'e1' },
                { type: 'USER_REGISTERED', timestamp: Date.now(), payload: { id: 'test-sim-user-1', email: 'sim@test.com', nick: 'sim', password_hash: '123' } },
                { type: 'USER_SUSPENDED', timestamp: Date.now(), payload: { userId: 'test-sim-user-1' } },
                { type: 'PASSWORD_UPDATED', timestamp: Date.now(), payload: { userId: 'test-sim-user-1', password_hash: 'new' } },
                { type: 'NICK_UPDATED', timestamp: Date.now(), payload: { userId: 'test-sim-user-1', nick: 'super' } }
            ]
        };

        const db = new DatabaseEngine(dbPath);
        db.close();

        const scenarioFile = path.join(testDir, 'scenario.json');
        fs.writeFileSync(scenarioFile, JSON.stringify(scenario));

        const program = new Command();
        registerSimulateCommand(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await program.parseAsync(['node', 'cr.js', 'simulate', scenarioFile, '-d', dbPath]);
        stdoutSpy.mockRestore();

        const db2 = new DatabaseEngine(dbPath);
        const testEnt = db2.getEntityByName('testEnt');
        expect(testEnt).toBeDefined();
        db2.close();
    });

    it('should assert materialized states', async () => {
        const expectedFile = path.join(testDir, 'expected.json');
        fs.writeFileSync(expectedFile, JSON.stringify({
           entities: [
               { name: 'testEnt', expected_content: 'test' }
           ],
           users: [
               { email: 'sim@test.com', nick: 'super' } // Notice, we simulate NICK_UPDATED above!
           ]
        }));

        const program = new Command();
        registerAssertCommand(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });

        // Run successful assertion
        await program.parseAsync(['node', 'cr.js', 'assert', expectedFile, '-d', dbPath]);

        // Run failing assertion
        fs.writeFileSync(expectedFile, JSON.stringify({ entities: [{ name: 'testEnt', expected_content: 'wrong-content' }], users: [{ email: 'sim@test.com', status: 'wrong-status' }] }));
        await program.parseAsync(['node', 'cr.js', 'assert', expectedFile, '-d', dbPath]);

        expect(exitSpy).toHaveBeenCalledWith(1);

        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should catch missing files cleanly', async () => {
        const program = new Command();
        registerSimulateCommand(program);
        registerAssertCommand(program);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(program.parseAsync(['node', 'cr.js', 'simulate', 'DOES_NOT_EXIST.json', '-d', dbPath])).rejects.toThrow('ENOENT');
        await expect(program.parseAsync(['node', 'cr.js', 'assert', 'DOES_NOT_EXIST.json', '-d', dbPath])).rejects.toThrow('ENOENT');

        exitSpy.mockRestore();
        stderrSpy.mockRestore();
    });
});
