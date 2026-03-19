import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Command } from 'commander';
import { registerImportExportCommands } from '../src/commands/importExport';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn } from 'child_process';

// Skip in CI by default unless explicitly running standard regression, because it relies on network traffic (GitHub).
describe.skipIf(process.env.CI === 'true')('E2E Real Repo Integration: http-server', () => {
    let testDir: string;
    let sourceDir: string;
    let exportDir: string;
    let dbPath: string;
    let db: DatabaseEngine;

    beforeAll(() => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-real-repo-'));
        dbPath = path.join(testDir, 'cr.sqlite');
        sourceDir = path.join(testDir, 'source-repo');
        exportDir = path.join(testDir, 'export-repo');
        
        db = new DatabaseEngine(dbPath);
    });

    afterAll(() => {
        db.close();
        try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (e) {}
    });

    it('should securely clone, import, format, export, and successfully boot a complex Express-like repo', async () => {
        // 1. Acquire Physical Baseline
        console.log(`[E2E] Cloning http-party/http-server into ${sourceDir}...`);
        execSync(`git clone --depth 1 https://github.com/http-party/http-server.git ${sourceDir}`, { stdio: 'ignore' });
        
        expect(fs.existsSync(path.join(sourceDir, 'package.json'))).toBe(true);

        // 2. CR Import Phase (Natively trace TS logic)
        console.log(`[E2E] Booting CR Importer...`);
        const programImport = new Command();
        programImport.option('-d, --db <path>');
        registerImportExportCommands(programImport);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { return undefined as never; });

        await programImport.parseAsync(['node', 'cr.js', 'import', sourceDir, '-d', dbPath, '-s', 'test-session-http']);

        // 3. Constrain the Boundaries
        const events = db.query('SELECT * FROM events WHERE session_id = ? AND type = ?', ['test-session-http', 'ARTEFACT_PROPOSAL']) as any[];
        expect(events.length).toBeGreaterThan(10); // http-server has dozens of files
        
        const importedPaths = events.map(e => JSON.parse(e.payload).path);
        expect(importedPaths).toContain('package.json');
        expect(importedPaths).toContain('bin/http-server');
        // Ensure .git was completely ignored
        expect(importedPaths.some(p => p.startsWith('.git/'))).toBe(false);

        // 4. CR Export Phase
        console.log(`[E2E] Booting CR Exporter to ${exportDir}...`);
        const programExport = new Command();
        programExport.option('-d, --db <path>');
        registerImportExportCommands(programExport);

        await programExport.parseAsync(['node', 'cr.js', 'export', exportDir, '-d', dbPath, '-s', 'test-session-http']);
        
        expect(fs.existsSync(path.join(exportDir, 'package.json'))).toBe(true);
        expect(fs.existsSync(path.join(exportDir, 'bin/http-server'))).toBe(true);

        // Restore console so we can debug any exec issues visually
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();

        // 5. Execution Verification
        console.log(`[E2E] Installing dependencies in materialized boundary...`);
        execSync('npm install --production', { cwd: exportDir, stdio: 'ignore' });
        
        console.log(`[E2E] Spinning up materialized Node binary...`);
        return new Promise<void>((resolve, reject) => {
             const serverProcess = spawn('node', ['bin/http-server', '-p', '18081', '--silent'], {
                 cwd: exportDir
             });

             let didResolve = false;

             serverProcess.on('error', (err) => {
                 if (!didResolve) reject(err);
             });

             // Wait a generous 2 seconds for boot up since it's an end-to-end integration check
             setTimeout(async () => {
                 try {
                     const response = await fetch('http://127.0.0.1:18081');
                     expect(response.status).toBe(200);
                     
                     const html = await response.text();
                     expect(html.length).toBeGreaterThan(10); // Proves the server emitted a valid HTML chunk
                     
                     serverProcess.kill();
                     didResolve = true;
                     resolve();
                 } catch (e) {
                     serverProcess.kill();
                     reject(new Error(`Failed to fetch from running http-server: ${(e as any).message}`));
                 }
             }, 2000);
        });
    }, 30000); // 30s timeout to allow git clone and npm install
});
