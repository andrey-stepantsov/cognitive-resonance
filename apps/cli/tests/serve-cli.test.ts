import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerServeCommand } from '../src/commands/serve';

const listenMock = vi.fn((port, cb) => {
    if (cb) cb();
});

vi.mock('http', async (importOriginal) => {
    const mod = await importOriginal() as any;
    return {
        ...mod,
        createServer: vi.fn(() => ({
            listen: listenMock
        }))
    };
});

vi.mock('ws', () => {
    return {
        WebSocketServer: vi.fn().mockImplementation(() => {
            return {
                on: vi.fn((event, cb) => {
                    if (event === 'connection') {
                        // Mock a dummy WebSocket connecting and disconnecting to hit lines 96-98
                        const dummyWs = { on: vi.fn((e, c) => { if (e === 'close') c(); }) };
                        cb(dummyWs);
                    }
                })
            };
        })
    };
});

describe('Serve CLI Command', () => {
    it('should register serve command, start http and ws servers', async () => {
        const program = new Command();
        registerServeCommand(program);

        const stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await program.parseAsync(['node', 'cr.js', 'serve', '-p', '4000']);

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('on http://localhost:4000'));
        expect(listenMock).toHaveBeenCalled();
        stdoutSpy.mockRestore();
    });
});
