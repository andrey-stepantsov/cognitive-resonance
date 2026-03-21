import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readStdin, askSecure, hookStdoutMute } from '../utils/prompt';
import * as readline from 'readline';

describe('prompt functions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('readStdin returns empty if isTTY', async () => {
        const originalIsTTY = process.stdin.isTTY;
        process.stdin.isTTY = true;
        const res = await readStdin();
        expect(res).toBe('');
        process.stdin.isTTY = originalIsTTY;
    });

    it('readStdin reads from piped stdin', async () => {
        const originalIsTTY = process.stdin.isTTY;
        process.stdin.isTTY = false;
        
        let onData: any;
        let onEnd: any;
        vi.spyOn(process.stdin, 'on').mockImplementation((event: string, cb: any) => {
            if (event === 'data') onData = cb;
            if (event === 'end') onEnd = cb;
            return process.stdin;
        });
        vi.spyOn(process.stdin, 'setEncoding').mockImplementation(() => process.stdin);

        const promise = readStdin();
        onData('mock piped input ');
        onEnd();
        const res = await promise;
        expect(res).toBe('mock piped input');
        
        process.stdin.isTTY = originalIsTTY;
    });

    it('askSecure mutes stdout and resolves on answer', async () => {
        const rl = {
            question: vi.fn().mockImplementation((query, cb) => {
                setTimeout(() => cb('secret-password'), 10);
            }),
            stdoutMuted: false
        } as unknown as readline.Interface;

        const res = await askSecure(rl, 'Pass:');
        expect(res).toBe('secret-password');
        expect((rl as any).stdoutMuted).toBe(false);
    });

    it('hookStdoutMute hooks _writeToOutput correctly', () => {
        const rl = {
            _writeToOutput: vi.fn(),
            stdoutMuted: true
        } as any;

        readline.Interface.prototype['_writeToOutput'] = vi.fn();
        
        hookStdoutMute(rl);
        expect(typeof rl._writeToOutput).toBe('function');

        rl._writeToOutput('secret');
        expect(readline.Interface.prototype['_writeToOutput']).not.toHaveBeenCalled();

        rl._writeToOutput('\n');
        expect(readline.Interface.prototype['_writeToOutput']).toHaveBeenCalledWith('\n');
    });
});
