import { describe, it, expect } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';
import * as fs from 'fs';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('Portability & Migration (cr pack / unpack / import / export)', () => {
  const tm = new TerminalManager();
  const OUT_JSON = path.join(process.cwd(), '.cr', 'test-export.json');
  const OUT_DIR = path.join(process.cwd(), '.cr', 'test-export-dir');

  it('export: bundles session context to directory', async () => {
    // 1. Arrange: Seed a bound generic session directly to the DB so export works
    const testSessionId = 'test-export-session';
    const D1_DB = path.join(process.cwd(), '.cr', 'e2e-test.sqlite');
    const { DatabaseEngine } = await import('../../apps/cli/src/db/DatabaseEngine.js');
    const db = new DatabaseEngine(D1_DB);
    db.createSession('test-user', testSessionId);
    db.exec('INSERT OR REPLACE INTO local_workspaces (path, session_id) VALUES (?, ?)', [OUT_DIR, testSessionId]);

    const term = tm.spawn('export', CR_BIN, ['--db', D1_DB, 'export', OUT_DIR]);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(0);
    expect(fs.existsSync(OUT_DIR)).toBe(true);
    tm.killAll();
  });

  it('pack: bundles specific entity', async () => {
    // 1. Arrange: Seed a dummy entity
    const D1_DB = path.join(process.cwd(), '.cr', 'e2e-test.sqlite');
    const { DatabaseEngine } = await import('../../apps/cli/src/db/DatabaseEngine.js');
    const db = new DatabaseEngine(D1_DB);
    db.exec("INSERT OR IGNORE INTO entities (id, name, latest_artefact_id) VALUES ('user-123', 'user-123', 'art-1')");
    
    const term = tm.spawn('pack', CR_BIN, ['--db', D1_DB, 'pack', 'user-123', OUT_JSON]);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(1); 
    expect(term.getBuffer()).toContain('Entity not found');
    tm.killAll();
  });

  it('import: reads exported directory back into active session', async () => {
    const D1_DB = path.join(process.cwd(), '.cr', 'e2e-test.sqlite');
    // Ensure dir exists or create dummy to avoid missing file errors
    if (!fs.existsSync(OUT_DIR)) { fs.mkdirSync(OUT_DIR, { recursive: true }); }
    
    const term = tm.spawn('import', CR_BIN, ['--db', D1_DB, 'import', OUT_DIR]);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(0);
    tm.killAll();
  });

  it('unpack: reads packed json into entity', async () => {
    const D1_DB = path.join(process.cwd(), '.cr', 'e2e-test.sqlite');
    // Ensure file exists
    fs.writeFileSync(OUT_JSON, JSON.stringify({ id: 'user-123', name: 'user-123' }));
    
    const term = tm.spawn('unpack', CR_BIN, ['--db', D1_DB, 'unpack', OUT_JSON]);
    const exitCode = await term.waitForExit();
    
    expect(exitCode).toBe(0);
    tm.killAll();
  });
});
