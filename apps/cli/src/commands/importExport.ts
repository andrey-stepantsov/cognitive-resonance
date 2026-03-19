import { Command } from 'commander';
import { DatabaseEngine } from '../db/DatabaseEngine';
import * as path from 'path';
import * as fs from 'fs';
import ignore from 'ignore';
import { logger } from '../utils/logger';
import { Materializer } from '@cr/core/src/services/Materializer';

export function registerImportExportCommands(program: Command) {
    program
        .command('import <dirPath>')
        .description('Import a physical directory into a Cognitive Resonance session')
        .option('-s, --session <id>', 'Force a specific session ID to import into')
        .action(async (dirPath, options, command) => {
            const globalOpts = command.parent?.opts() || {};
            const dbPath = program.opts().db || path.join(path.resolve(process.cwd(), '.cr'), 'central.sqlite');
            const dbEngine = new DatabaseEngine(dbPath);

            const absolutePath = path.resolve(process.cwd(), dirPath);
            if (!fs.existsSync(absolutePath)) {
                logger.error(`Path does not exist: ${absolutePath}`);
                process.exit(1);
            }

            // 1. Resolve Session State Binding
            let sessionId = options.session;
            if (!sessionId) {
                // Look up established workspace mapping
                const workspace = dbEngine.query('SELECT session_id FROM local_workspaces WHERE path = ?', [absolutePath]) as any[];
                if (workspace.length > 0) {
                    sessionId = workspace[0].session_id;
                    logger.info(`Found existing workspace binding for session: ${sessionId}`);
                } else {
                    sessionId = require('crypto').randomUUID();
                    dbEngine.exec('INSERT INTO local_workspaces (path, session_id) VALUES (?, ?)', [absolutePath, sessionId]);
                    dbEngine.createSession('local-user', sessionId);
                    logger.info(`Created new bounding session and linked workspace: ${sessionId}`);
                }
            } else {
                dbEngine.exec('INSERT OR REPLACE INTO local_workspaces (path, session_id) VALUES (?, ?)', [absolutePath, sessionId]);
            }

            // 2. Build Ignore Rules
            const ig = ignore().add(['.git', '.cr', 'node_modules', 'dist']);
            const gitignorePath = path.join(absolutePath, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                ig.add(fs.readFileSync(gitignorePath, 'utf8'));
            }

            // 3. Walk and Extract
            const filesToImport: string[] = [];
            const walk = (currentDir: string) => {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    const relPath = path.relative(absolutePath, fullPath);
                    if (ig.ignores(relPath)) continue;

                    if (entry.isDirectory()) {
                        walk(fullPath);
                    } else if (entry.isFile()) {
                        filesToImport.push(relPath);
                    }
                }
            };
            walk(absolutePath);

            // 4. Emit Events
            logger.info(`Importing ${filesToImport.length} files...`);
            let lastEventId: string | null = null;
            for (const file of filesToImport) {
                const content = fs.readFileSync(path.join(absolutePath, file), 'utf8');
                // Skip binary files naively for now (if content contains lots of null chars)
                if (content.indexOf('\0') !== -1) continue;

                const payload = {
                    path: file,
                    patch: content,
                    isFullReplacement: true
                };

                const ev: any = {
                    session_id: sessionId,
                    timestamp: Date.now(),
                    actor: 'System-Importer',
                    type: 'ARTEFACT_PROPOSAL',
                    payload: JSON.stringify(payload),
                    previous_event_id: lastEventId
                };
                lastEventId = dbEngine.appendEvent(ev).toString(); // Wait, appendEvent returns number -> string. Actually let's just pass null to avoid string casting issues if it's returning integer ID.
                dbEngine.appendEvent(ev);
            }

            logger.info(`Materialized repository footprint successfully bound to session ${sessionId}.`);
        });

    program
        .command('export <dirPath>')
        .description('Export the final virtual state of a session back to a physical directory')
        .option('-s, --session <id>', 'Force a specific session ID to export from')
        .action(async (dirPath, options, command) => {
            const globalOpts = command.parent?.opts() || {};
            const dbPath = program.opts().db || path.join(path.resolve(process.cwd(), '.cr'), 'central.sqlite');
            const dbEngine = new DatabaseEngine(dbPath);

            const absolutePath = path.resolve(process.cwd(), dirPath);

            let sessionId = options.session;
            if (!sessionId) {
                const workspace = dbEngine.query('SELECT session_id FROM local_workspaces WHERE path = ?', [absolutePath]) as any[];
                if (workspace.length > 0) {
                    sessionId = workspace[0].session_id;
                } else {
                    logger.error(`No default session bound to this directory. Please use --session or cr import first.`);
                    process.exit(1);
                }
            }

            if (!fs.existsSync(absolutePath)) {
                fs.mkdirSync(absolutePath, { recursive: true });
            }

            logger.info(`Computing virtual state for session ${sessionId}...`);
            const sessionEvents = dbEngine.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
            const materializer = new Materializer(absolutePath);
            
            // Reconstruct the virtual state exactly to compare explicitly deleted files
            const virtualState = materializer.computeVirtualState(sessionEvents);
            await materializer.computeAndMaterialize(sessionEvents, absolutePath);

            // Phase 3 Deletion Constraint: Clean up physical files that were explicitly deleted AND are absent from final virtual state
            let deletedCount = 0;
            for (const ev of sessionEvents) {
                 if (ev.type === 'FILE_DELETED' || ev.type === 'PWA_DELETE' || (ev.type === 'ARTEFACT_PROPOSAL' && JSON.parse(ev.payload).isFullReplacement && JSON.parse(ev.payload).patch === '')) {
                     const payload = JSON.parse(ev.payload);
                     const targetPath = payload.path || payload.target; // support multiple historical payload formats
                     if (targetPath && !virtualState.has(targetPath)) {
                         const physicalFile = path.join(absolutePath, targetPath);
                         if (fs.existsSync(physicalFile)) {
                             fs.unlinkSync(physicalFile);
                             deletedCount++;
                             logger.info(`Materializer export safely unlinked explicitly tombstoned file: ${targetPath}`);
                         }
                     }
                 }
            }

            logger.info(`Export finished. Materialized footprint with ${deletedCount} explicit unlinks. Safe local states and mtimes preserved.`);
        });
}
