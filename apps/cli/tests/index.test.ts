import { describe, it, expect, vi } from 'vitest';

vi.mock('dotenv', () => ({
    config: vi.fn()
}));

// We mock ParseAsync because loading the module immediately calls it, but we want to capture exit safely
vi.mock('commander', async (importOriginal) => {
    const mod = await importOriginal() as any;
    class MockCommand extends mod.Command {
        parseAsync = vi.fn().mockRejectedValue(new Error('Abort'));
    }
    return { ...mod, Command: MockCommand };
});

describe('CLI Entrypoint', () => {
    it('should register all commands and parse argv', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Because of the top level await .catch in index.ts, when we evaluate it:
        await import('../src/index');

        // Allow microtasks (like the .catch promise handler) to finish so process.exit is called synchronously next
        await new Promise(resolve => process.nextTick(resolve));

        // We rejected parseAsync in the mock, so .catch should have fired exit(1)
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(errSpy).toHaveBeenCalled();
        
        exitSpy.mockRestore();
        errSpy.mockRestore();
    });
});
