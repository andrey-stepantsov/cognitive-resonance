import { vi, describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerMcpCommand } from '../src/commands/mcp';

vi.mock('../src/services/MCPServer', () => ({
    CognitiveMCPServer: class {
        start() { return Promise.resolve(); }
    }
}));

vi.mock('../src/db/DatabaseEngine', () => ({
    DatabaseEngine: class {
        createSession() { return 'mock-session'; }
    }
}));

describe('MCP CLI Command', () => {
    it('should start the MCP Server correctly', async () => {
        const program = new Command();
        program.option('-d, --db <path>', 'Database path', 'cr.sqlite');
        registerMcpCommand(program);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => { return undefined as never; });
        const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await program.parseAsync(['node', 'cr.js', 'mcp']);

        expect(stderrSpy).not.toHaveBeenCalled();
        exitSpy.mockRestore();
        stderrSpy.mockRestore();
    });
});
