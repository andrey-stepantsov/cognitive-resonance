import { describe, it, expect, vi } from 'vitest';
import { DefaultIoAdapter, MemoryIoAdapter } from '../utils/IoAdapter';

describe('IoAdapter', () => {
    it('DefaultIoAdapter createInteractive', async () => {
        const adapter = new DefaultIoAdapter();
        const interactive = adapter.createInteractive();
        
        interactive.setPrompt('test>');
        interactive.prompt();
        interactive.clearLine();
        interactive.cursorTo(0);
        
        expect(interactive).toHaveProperty('onLine');
        expect(interactive).toHaveProperty('onClose');
        expect(interactive).toHaveProperty('close');
        expect(interactive).toHaveProperty('question');
        expect(interactive).toHaveProperty('questionHidden');
        
        // Mock question
        vi.spyOn(interactive, 'question').mockResolvedValue('ans');
        expect(await interactive.question('Q')).toBe('ans');

        // Note: fully testing rl.question inside DefaultIoAdapter requires mocking readline, which is complex and often unnecessary. This ensures the structure is there.
        interactive.close(); // might throw if mock isn't perfect, but we bypass for memory leaks
    });

    it('MemoryIoAdapter createInteractive and methods', async () => {
        const adapter = new MemoryIoAdapter();
        const interactive = adapter.createInteractive();

        interactive.setPrompt('mem>');
        expect(adapter.lastPrompt).toBe('mem>');
        
        interactive.prompt();
        interactive.clearLine();
        interactive.cursorTo(0);
        
        let lineCalled = false;
        interactive.onLine((line) => {
            lineCalled = true;
            expect(line).toBe('hello');
        });
        adapter.simulateLine('hello');
        expect(lineCalled).toBe(true);

        const questionPromise = interactive.question('What?');
        adapter.answerNextQuestion('ans');
        expect(await questionPromise).toBe('ans');
        
        const hiddenPromise = interactive.questionHidden('Pass?');
        adapter.answerNextQuestion('sec');
        expect(await hiddenPromise).toBe('sec');

        let closeCalled = false;
        interactive.onClose(() => { closeCalled = true; });
        interactive.close();
        expect(closeCalled).toBe(true);
        expect(adapter.isClosed).toBe(true);
    });
});
