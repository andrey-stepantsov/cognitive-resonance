import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Command } from 'commander';
import { registerObserveCommands } from '../src/commands/observe';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as fs from 'fs';
import * as path from 'path';

describe('Observe CLI Commands Output Parsing', () => {
    const testDir = path.join(__dirname, 'observe-test-temp');
    const dbPath = path.join(testDir, 'observe.sqlite');

    beforeAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should list sessions when calling turns without sid', async () => {
        const db = new DatabaseEngine(dbPath);
        db.createSession('SYS', 's1');
        db.appendEvent({ session_id: 's1', timestamp: Date.now(), actor: 'sys', type: 'SYS', payload: 'test', previous_event_id: null });
        db.close();

        const program = new Command();
        registerObserveCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await program.parseAsync(['node', 'cr.js', 'turns', '-d', dbPath]);
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('- s1'));
        stdoutSpy.mockRestore();
    });

    it('should print user prompts and AI responses properly', async () => {
        const db = new DatabaseEngine(dbPath);
        db.createSession('SYS', 's2');
        db.appendEvent({ session_id: 's2', timestamp: Date.now(), actor: 'user', type: 'USER_PROMPT', payload: JSON.stringify({ text: 'Hello' }), previous_event_id: null });
        db.appendEvent({ session_id: 's2', timestamp: Date.now(), actor: 'ai', type: 'AI_RESPONSE', payload: JSON.stringify({ text: 'Hi', dissonance: 10 }), previous_event_id: null });
        db.appendEvent({ session_id: 's2', timestamp: Date.now(), actor: 'ai', type: 'AI_RESPONSE', payload: 'bad-json', previous_event_id: null }); // Error path
        db.appendEvent({ session_id: 's2', timestamp: Date.now(), actor: 'user', type: 'USER_PROMPT', payload: 'bad-json', previous_event_id: null }); // Error path
        db.close();

        const program = new Command();
        registerObserveCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        await program.parseAsync(['node', 'cr.js', 'turns', 's2', '-d', dbPath]);
        
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Hello'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Hi'));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Unparseable'));
        stdoutSpy.mockRestore();
    });

    it('should test follow streaming mode', async () => {
        vi.useFakeTimers();

        const program = new Command();
        registerObserveCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        
        // Start follow (it will loop infinitely)
        const parsePromise = program.parseAsync(['node', 'cr.js', 'follow', 's2', '-d', dbPath]);
        
        // Advance timer to trigger interval
        vi.advanceTimersByTime(1000);
        
        // Stop timers
        vi.useRealTimers();
        
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Watching session'));
        stdoutSpy.mockRestore();
    });
});
