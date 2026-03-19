import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import ignore from 'ignore';
import { Materializer } from '@cr/core/src/services/Materializer';

describe('E2E: Git Import/Export Safety Limits', () => {
    let db: DatabaseEngine;
    let tempDir: string;
    let dbPath: string;
    let sessionId: string;
    let targetRepoPath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-git-e2e-'));
        dbPath = path.join(tempDir, 'cr.sqlite');
        db = new DatabaseEngine(dbPath);
        sessionId = db.createSession('TEST_USER');
        
        targetRepoPath = path.join(tempDir, 'fake-repo');
        fs.mkdirSync(targetRepoPath);
    });

    afterEach(() => {
        db.close();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    });

    it('should securely import files, track exclusions via materializer, and never export over untracked files', async () => {
        // 1. Setup minimal fake physical repo
        fs.writeFileSync(path.join(targetRepoPath, 'README.md'), 'Original Text');
        fs.writeFileSync(path.join(targetRepoPath, 'core.ts'), 'export const a = 1;');
        fs.writeFileSync(path.join(targetRepoPath, '.gitignore'), 'node_modules\n.env');
        fs.mkdirSync(path.join(targetRepoPath, 'node_modules'));
        fs.writeFileSync(path.join(targetRepoPath, 'node_modules', 'dep.js'), 'bad');

        // Execute "cr import" Logic manually inside the test since we don't want to spawn child processes for the CLI itself to preserve coverage tracing
        const importFn = () => {
             db.exec('INSERT INTO local_workspaces (path, session_id) VALUES (?, ?)', [targetRepoPath, sessionId]);
             
             const ig = ignore().add(['.git', '.cr', 'node_modules', 'dist']);
             const gitignorePath = path.join(targetRepoPath, '.gitignore');
             ig.add(fs.readFileSync(gitignorePath, 'utf8'));

             const filesToImport: string[] = [];
             const walk = (currentDir: string) => {
                 const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                 for (const entry of entries) {
                     const fullPath = path.join(currentDir, entry.name);
                     const relPath = path.relative(targetRepoPath, fullPath);
                     if (ig.ignores(relPath)) continue;
                     if (entry.isDirectory()) walk(fullPath);
                     else if (entry.isFile()) filesToImport.push(relPath);
                 }
             };
             walk(targetRepoPath);

             for (const file of filesToImport) {
                 const content = fs.readFileSync(path.join(targetRepoPath, file), 'utf8');
                 db.appendEvent({
                     session_id: sessionId,
                     timestamp: Date.now(),
                     actor: 'System',
                     type: 'ARTEFACT_PROPOSAL',
                     payload: JSON.stringify({ path: file, patch: content, isFullReplacement: true }),
                     previous_event_id: null
                 });
             }
        };

        // Run Import phase
        importFn();

        // 2. Assert Import worked & ignored node_modules
        const importedEvents = db.query("SELECT * FROM events WHERE type = 'ARTEFACT_PROPOSAL'") as any[];
        const importedPaths = importedEvents.map(e => JSON.parse(e.payload).path);
        
        expect(importedPaths).toContain('README.md');
        expect(importedPaths).toContain('core.ts');
        expect(importedPaths).toContain('.gitignore');
        expect(importedPaths).not.toContain('node_modules/dep.js');

        // 3. Simulate Active Modifying virtual state (Agent edits README and DELETES core.ts)
        db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: 'Agent',
            type: 'FILE_DELETED',
            payload: JSON.stringify({ path: 'core.ts' }),
            previous_event_id: null
        });
        db.appendEvent({
            session_id: sessionId,
            timestamp: Date.now(),
            actor: 'Agent',
            type: 'ARTEFACT_PROPOSAL',
            payload: JSON.stringify({ path: 'README.md', patch: 'Updated Text', isFullReplacement: true }),
            previous_event_id: null
        });

        // 4. Untracked physical file injection! (e.g. human adds a local secret key)
        const secretPath = path.join(targetRepoPath, '.env.local');
        fs.writeFileSync(secretPath, 'SECRET=123');

        // Execute "cr export" Logic
        const exportFn = async () => {
            const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
            const materializer = new Materializer(targetRepoPath);
            const virtualState = materializer.computeVirtualState(sessionEvents);
            await materializer.computeAndMaterialize(sessionEvents, targetRepoPath);

            // Phase 3 Deletion Constraint (matches CLI logic)
            for (const ev of sessionEvents) {
                 if (ev.type === 'FILE_DELETED') {
                     const payload = JSON.parse(ev.payload);
                     const targetPath = payload.path || payload.target;
                     if (targetPath && !virtualState.has(targetPath)) {
                         const physicalFile = path.join(targetRepoPath, targetPath);
                         if (fs.existsSync(physicalFile)) fs.unlinkSync(physicalFile);
                     }
                 }
            }
        };
        
        await exportFn();

        // 5. Assert Final Physical Footprint Safety Constraint
        // core.ts must be deleted because an explicit FILE_DELETED event requested it.
        expect(fs.existsSync(path.join(targetRepoPath, 'core.ts'))).toBe(false);
        
        // README.md must be updated
        expect(fs.readFileSync(path.join(targetRepoPath, 'README.md'), 'utf-8')).toBe('Updated Text');
        
        // node_modules logic remains safely ignored by standard FS
        expect(fs.existsSync(path.join(targetRepoPath, 'node_modules', 'dep.js'))).toBe(true);

        // SAFETY: The untracked .env.local file MUST STILL EXIST, never blindly unlinked!
        expect(fs.existsSync(secretPath)).toBe(true);
        expect(fs.readFileSync(secretPath, 'utf-8')).toBe('SECRET=123');
    });
});
