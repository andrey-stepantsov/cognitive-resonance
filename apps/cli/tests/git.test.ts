import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Command } from 'commander';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import { registerGitCommands } from '../src/commands/git';
import { join } from 'path';
import { rmSync, mkdirSync, writeFileSync } from 'fs';

describe('Git Backend E2E', () => {
    const testDir = join(__dirname, 'git-test-temp');
    const dbPath = join(testDir, 'git-test.sqlite');
    const cliPath = join(__dirname, '../bin/cr.js');

    beforeAll(async () => {
        rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
    });
    
    afterAll(() => {
        rmSync(testDir, { recursive: true, force: true });
    });
    
    it('should git-clone and materialize into DB', async () => {
        const repoUrl = `https://github.com/octocat/Hello-World.git`;
        
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerGitCommands(program);

        try {
            await program.parseAsync(['node', 'cr.js', '-d', dbPath, 'git-clone', repoUrl]);
        } catch (err: any) {
            console.error('Test git-clone failed:', err.message);
            throw err;
        }
        
        const db = new DatabaseEngine(dbPath);
        const entity = db.getEntityByName(repoUrl) as any;
        expect(entity).toBeDefined();
        
        const composite = db.getArtefact(entity.latest_artefact_id) as any;
        expect(composite.type).toBe('COMPOSITE');
        
        const tree = JSON.parse(composite.content);
        expect(tree['README']).toBeDefined(); // Hello-World repo has a README
        
        const codeArt = db.getArtefact(tree['README']) as any;
        expect(codeArt.type).toBe('CODE');
        expect(codeArt.content).toContain('Hello World!');
        db.close();
    });
    
    it('should git-push materialized entity back (local commit verification)', async () => {
        const repoUrl = `https://github.com/octocat/Hello-World.git`;
        const newDbPath = join(testDir, 'git-test.sqlite');
        const targetUrl = `https://github.com/invalid/dummy-repo-never-exists.git`;
        
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerGitCommands(program);

        // Spy on stdout to capture the logs that `git-push` prints natively
        let stdout = '';
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
            stdout += args.join(' ') + '\n';
        });
        
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });

        try {
            await program.parseAsync(['node', 'cr.js', '-d', newDbPath, 'git-push', repoUrl, targetUrl]);
        } catch (err: any) {
            // Unhandled rejections or crashes
        }
        
        expect(stdout).toContain('Committed locally as');
        expect(stdout).toContain('Pushing...');

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });
});
