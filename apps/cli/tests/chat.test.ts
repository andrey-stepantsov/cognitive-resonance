import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Command } from 'commander';
import { registerChatCommands } from '../src/commands/chat';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Mock gemini to force exception
let _mockReject = true;
let _mockFiles = false;

vi.mock('@cr/core/src/services/GeminiService', () => ({
    initGemini: vi.fn(),
    generateResponse: vi.fn().mockImplementation(async () => {
        if (_mockReject) throw new Error('Simulated API Crash');
        return {
            reply: 'Mocked AI Response',
            dissonanceScore: 10,
            nodes: [],
            files: _mockFiles ? [{ path: 'test.txt', content: 'test content' }] : []
        };
    }),
    fetchModels: vi.fn().mockResolvedValue([])
}));

vi.mock('@cr/core/src/services/ArtefactManager', () => ({
    ArtefactManager: class {
        proposeDrafts() { return Promise.resolve([{ path: 'test.txt', patch: 'mock patch', isFullReplacement: false }]); }
    }
}));

vi.mock('readline', () => ({
    createInterface: vi.fn()
}));

describe('Chat Error States & Headless Stdin (In-Process)', () => {
    const testDir = path.join(__dirname, 'chat-err-temp');
    const dbPath = path.join(testDir, 'chat-err.sqlite');

    beforeAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should catch and print API errors cleanly during interactive REPL', async () => {
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerChatCommands(program);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });
        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const mockRl = new EventEmitter() as any;
        mockRl.prompt = vi.fn();
        mockRl.close = () => { mockRl.emit('close'); };
        (readline.createInterface as any).mockReturnValue(mockRl);

        const parsePromise = program.parseAsync(['node', 'cr.js', '-d', dbPath, 'chat']);
        await new Promise(r => setTimeout(r, 20));

        // Submit prompt to trigger the mocked rejection
        mockRl.emit('line', 'Crash me');
        await new Promise(r => setTimeout(r, 20));

        // Attempt Headless formatting branch
        mockRl.emit('line', '/exit');
        await parsePromise;

        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Simulated API Crash'));

        exitSpy.mockRestore();
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    it('should run headless mode with format JSON', async () => {
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerChatCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });

        // Running headless with format json
        // The mock still rejects, so it should catch!
        await program.parseAsync(['node', 'cr.js', '-d', dbPath, 'chat', 'say something', '-f', 'json']);

        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Simulated API Crash'));
        
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should handle /exec and automatic handoff loops successfully', async () => {
        _mockReject = false;
        _mockFiles = true;

        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerChatCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });

        const mockRl = new EventEmitter() as any;
        mockRl.prompt = vi.fn();
        mockRl.close = () => { mockRl.emit('close'); };
        (readline.createInterface as any).mockReturnValue(mockRl);

        const parsePromise = program.parseAsync(['node', 'cr.js', '-d', dbPath, 'chat']);
        await new Promise(r => setTimeout(r, 20));

        // Test normal CLI command
        mockRl.emit('line', '/exec echo hello');
        await new Promise(r => setTimeout(r, 20));

        // Test Native Node VM command
        mockRl.emit('line', '/exec node src/index.js');
        await new Promise(r => setTimeout(r, 20));

        // Test automatic handoff loop with file generation
        mockRl.emit('line', 'Please generate a file');
        await new Promise(r => setTimeout(r, 50));

        // Exit REPL
        mockRl.emit('line', '/exit');
        await parsePromise;

        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
        _mockReject = true;
        _mockFiles = false;
    });

    it('should load an existing session from DB and restore history', async () => {
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerChatCommands(program);
        
        const db = new DatabaseEngine(dbPath);
        const sid = db.createSession('TEST_USER');
        db.appendEvent({ session_id: sid, type: 'USER_PROMPT', timestamp: Date.now(), actor: 'user', payload: JSON.stringify({ text: 'Hello' }), previous_event_id: null });
        db.appendEvent({ session_id: sid, type: 'AI_RESPONSE', timestamp: Date.now(), actor: 'model', payload: JSON.stringify({ text: 'Hi' }), previous_event_id: null });

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });
        const mockRl = new EventEmitter() as any;
        mockRl.prompt = vi.fn();
        mockRl.close = () => { mockRl.emit('close'); };
        (readline.createInterface as any).mockReturnValue(mockRl);

        const parsePromise = program.parseAsync(['node', 'cr.js', '-d', dbPath, 'chat', '-s', sid]);
        await new Promise(r => setTimeout(r, 20));
        mockRl.emit('line', '/exit');
        await parsePromise;
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Rehydrated Session'));
        stdoutSpy.mockRestore();
        exitSpy.mockRestore();
    });

    it('should handle autocompletion internally', async () => {
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerChatCommands(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });
        const mockRl = new EventEmitter() as any;
        mockRl.prompt = vi.fn();
        mockRl.close = () => { mockRl.emit('close'); };
        (readline.createInterface as any).mockReturnValue(mockRl);

        const parsePromise = program.parseAsync(['node', 'cr.js', '-d', dbPath, 'chat']);
        await new Promise(r => setTimeout(r, 20));

        // Note: the mock creates a specific parameter signature we can intercept
        const completer = (readline.createInterface as any).mock.calls[(readline.createInterface as any).mock.calls.length - 1][0].completer;
        
        const [hits1, match1] = completer('/model use g');
        expect(match1).toBe('g');

        const [hits2, match2] = completer('@sci');
        expect(match2).toBe('@sci');

        const [hits3, match3] = completer('/he');
        expect(match3).toBe('/he');

        mockRl.emit('line', '/exit');
        await parsePromise;
        stdoutSpy.mockRestore();
        exitSpy.mockRestore();
    });
});
