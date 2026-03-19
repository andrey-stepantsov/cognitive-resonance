import { Command } from 'commander';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { CognitiveMCPServer } from '../services/MCPServer';
import * as path from 'path';

export function registerMcpCommand(program: Command) {
  program
    .command('mcp')
    .description('Starts the Cognitive Resonance Model Context Protocol (MCP) Server for AI tools')
    .option('-s, --session <id>', 'Session ID to associate events with', 'local-mcp-session')
    .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
    .option('--db <path>', 'Path to SQLite database')
    .action(async (options) => {
      const workspaceDir = path.resolve(process.cwd(), options.workspace);
      const defaultDbPath = path.join(path.resolve(workspaceDir, '.cr'), 'cr.sqlite');
      const dbPath = options.db ? path.resolve(process.cwd(), options.db) : defaultDbPath;
      
      const db = new DatabaseEngine(dbPath);
      
      // Ensure session exists
      db.createSession('LOCAL_USER', options.session);

      const mcpServer = new CognitiveMCPServer(db, options.session);
      await mcpServer.start();
    });
}
