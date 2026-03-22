import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { registerAuditorCommand } from '../commands/auditor';
import { Command } from 'commander';
import * as gemini from '@cr/core/src/services/GeminiService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('@cr/core/src/services/GeminiService', async (importOriginal) => {
  return {
    ...(await importOriginal() as any),
    validateProposal: vi.fn(),
  };
});

describe('Auditor Daemon', () => {
    let program: Command;
    let dbPath: string;
    let db: DatabaseEngine;
    
    beforeEach(() => {
        program = new Command();
        program.option('-d, --db <path>', 'Global option: Path to SQLite database');
        dbPath = path.join(os.tmpdir(), `test-auditor-${Date.now()}.sqlite`);
        db = new DatabaseEngine(dbPath);
        
        // Register the command
        registerAuditorCommand(program);
        
        vi.useFakeTimers();
    });
    
    afterEach(() => {
        vi.useRealTimers();
        db.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        vi.clearAllMocks();
    });

    it('should flag unsafe skill proposals', async () => {
        vi.mocked(gemini.validateProposal).mockResolvedValue({ isSafe: false, reason: 'rm -rf prohibited' });
        
        // Start the daemon first so its baseline maxTs is 0
        program.parseAsync(['node', 'test', 'serve-auditor', '--db', dbPath]);
        
        // Setup events
        db.appendEvent({
             session_id: 'session-1',
             timestamp: Date.now(),
             actor: 'user',
             type: 'ARTEFACT_PROPOSAL',
             payload: JSON.stringify({
                 path: '.cr/skills/dangerous.ts',
                 patch: 'execSync("rm -rf /");'
             }),
             previous_event_id: null
        });
        
        // Wait for the interval to fire and async promises to resolve
        await vi.advanceTimersByTimeAsync(2500);
        
        // Check if an AI_RESPONSE was appended flagging the issue
        const responses = db.query("SELECT * FROM events WHERE type = 'AI_RESPONSE'") as any[];
        expect(responses.length).toBe(1);
        expect(responses[0].actor).toBe('SemanticLibrarian');
        expect(responses[0].payload).toContain('Unsafe logic detected');
        expect(responses[0].payload).toContain('rm -rf prohibited');
        expect(gemini.validateProposal).toHaveBeenCalledWith('execSync("rm -rf /");');
    });

    it('should verify safe skill proposals silently', async () => {
        vi.mocked(gemini.validateProposal).mockResolvedValue({ isSafe: true, reason: 'Looks ok' });
        
        program.parseAsync(['node', 'test', 'serve-auditor', '--db', dbPath]);
        
        db.appendEvent({
             session_id: 'session-2',
             timestamp: Date.now(),
             actor: 'user',
             type: 'ARTEFACT_PROPOSAL',
             payload: {
                 path: '.cr/skills/builder.ts',
                 patch: 'console.log("building");'
             },
             previous_event_id: null
        });
        
        await vi.advanceTimersByTimeAsync(2500);
        
        const responses = db.query("SELECT * FROM events WHERE type = 'AI_RESPONSE'") as any[];
        expect(responses.length).toBe(1);
        expect(responses[0].actor).toBe('SemanticLibrarian');
        expect(responses[0].payload).toContain('skill_verified');
    });

    it('should ignore non-skill proposals', async () => {
        db.appendEvent({
             session_id: 'session-3',
             timestamp: Date.now() - 1000,
             actor: 'user',
             type: 'ARTEFACT_PROPOSAL',
             payload: {
                 path: 'src/utils/math.ts',
                 patch: 'export const add = (a, b) => a + b;'
             },
             previous_event_id: null
        });
        
        program.parseAsync(['node', 'test', 'serve-auditor', '--db', dbPath]);
        
        await vi.advanceTimersByTimeAsync(2500);
        
        // No validation should happen
        expect(gemini.validateProposal).not.toHaveBeenCalled();
        const responses = db.query("SELECT * FROM events WHERE type = 'AI_RESPONSE'") as any[];
        expect(responses.length).toBe(0);
    });

    it('should back off and try again later on AI failure', async () => {
        let callCount = 0;
        vi.mocked(gemini.validateProposal).mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error("Quota exceeded");
            return { isSafe: true, reason: 'Recovered' };
        });

        program.parseAsync(['node', 'test', 'serve-auditor', '--db', dbPath]);

        db.appendEvent({
             session_id: 'session-fail',
             timestamp: Date.now(),
             actor: 'user',
             type: 'ARTEFACT_PROPOSAL',
             payload: JSON.stringify({ path: '.cr/skills/test.ts', patch: 'hello' }),
             previous_event_id: null
        });

        // 1st tick: fails and sets 30s cooldown
        await vi.advanceTimersByTimeAsync(2500);
        expect(callCount).toBe(1);
        
        let responses = db.query("SELECT * FROM events WHERE type = 'AI_RESPONSE'") as any[];
        expect(responses.length).toBe(0);

        // 2nd tick (10s later): still in cooldown, no new call
        await vi.advanceTimersByTimeAsync(10000);
        expect(callCount).toBe(1);

        // 3rd tick (25s later): cooldown expired. Loop picks up the same event because lastSeenTs wasn't advanced
        await vi.advanceTimersByTimeAsync(25000);
        expect(callCount).toBe(2);
        
        responses = db.query("SELECT * FROM events WHERE type = 'AI_RESPONSE'") as any[];
        expect(responses.length).toBe(1);
        expect(responses[0].payload).toContain('skill_verified');
    });
});
