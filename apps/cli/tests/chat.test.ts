import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Command } from 'commander';
import { registerChatCommands } from '../src/commands/chat';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Mock gemini to force exception
vi.mock('@cr/core/src/services/GeminiService', () => ({
    initGemini: vi.fn(),
    generateResponse: vi.fn().mockRejectedValue(new Error('Simulated API Crash')),
    fetchModels: vi.fn().mockResolvedValue([])
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
});
