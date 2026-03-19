import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Command } from 'commander';
import { registerImportExportCommands } from '../src/commands/importExport';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CLI Commands: Import / Export', () => {
    let testDir: string;
    let dbPath: string;
    let db: DatabaseEngine;
    let repoPath: string;

    beforeAll(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-cli-import-export-'));
        dbPath = path.join(testDir, 'cr.sqlite');
        repoPath = path.join(testDir, 'repo');
        
        fs.mkdirSync(repoPath);
        fs.writeFileSync(path.join(repoPath, 'index.ts'), 'console.log("hello");');
        fs.writeFileSync(path.join(repoPath, '.gitignore'), 'ignored.ts');
        fs.writeFileSync(path.join(repoPath, 'ignored.ts'), 'bad');
        
        db = new DatabaseEngine(dbPath);
    });

    afterAll(() => {
        db.close();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (e) {}
    });

    it('should successfully parse and execute cr import command', async () => {
        const program = new Command();
        program.option('-d, --db <path>');
        registerImportExportCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });

        // Run Import Command via CLI parser
        await program.parseAsync(['node', 'cr.js', 'import', repoPath, '-d', dbPath, '-s', 'test-session-123']);

        // Assert DB state updated correctly
        const events = db.query('SELECT * FROM events WHERE session_id = ?', ['test-session-123']) as any[];
        expect(events.length).toBeGreaterThan(0);
        
        const importedPaths = events.map(e => JSON.parse(e.payload).path);
        expect(importedPaths).toContain('index.ts');
        expect(importedPaths).toContain('.gitignore');
        expect(importedPaths).not.toContain('ignored.ts'); // Should be ignored via native parsing

        // Assert Local Workspaces table linked
        const workspaces = db.query('SELECT * FROM local_workspaces WHERE path = ?', [repoPath]) as any[];
        expect(workspaces.length).toBe(1);
        expect(workspaces[0].session_id).toBe('test-session-123');

        expect(exitSpy).not.toHaveBeenCalled();

        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should successfully parse and execute cr export command via linked workspace bounds', async () => {
        const program = new Command();
        program.option('-d, --db <path>');
        registerImportExportCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });

        // Emulate an AI agent mutating the index.ts
        db.appendEvent({
             session_id: 'test-session-123',
             timestamp: Date.now(),
             actor: 'Agent',
             type: 'ARTEFACT_PROPOSAL',
             payload: JSON.stringify({ path: 'index.ts', patch: 'console.log("goodbye");', isFullReplacement: true }),
             previous_event_id: null
        });

        // Run Export Command via CLI without explicit -s flag (It should resolve from local_workspaces seamlessly)
        await program.parseAsync(['node', 'cr.js', 'export', repoPath, '-d', dbPath]);

        // Assert physical file got updated!
        const exportedContent = fs.readFileSync(path.join(repoPath, 'index.ts'), 'utf8');
        expect(exportedContent).toBe('console.log("goodbye");');

        expect(exitSpy).not.toHaveBeenCalled();

        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });
    
    it('should cleanly throw process.exit(1) gracefully on non-existent directories for import', async () => {
        const program = new Command();
        program.option('-d, --db <path>');
        registerImportExportCommands(program);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { throw new Error('process.exit() mocked'); });
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(program.parseAsync(['node', 'cr.js', 'import', path.join(testDir, 'does-not-exist'), '-d', dbPath])).rejects.toThrow('process.exit() mocked');

        exitSpy.mockRestore();
        stderrSpy.mockRestore();
    });
});
