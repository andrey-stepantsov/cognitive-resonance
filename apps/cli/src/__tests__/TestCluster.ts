import { Command } from 'commander';
import { DatabaseEngine } from '../db/DatabaseEngine.js';
import { MemoryIoAdapter } from '../utils/IoAdapter.js';
import { registerServeCommand, runSyncDaemon } from '../commands/serve.js';
import { registerChatCommands } from '../commands/chat.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class TestCluster {
  public tempDir: string;
  public dbPath: string;
  public db: DatabaseEngine;
  public daemonIo: MemoryIoAdapter;
  public replIo: MemoryIoAdapter;

  constructor() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-cluster-'));
    this.dbPath = path.join(this.tempDir, 'central.sqlite');
    this.db = new DatabaseEngine(this.dbPath); // Observer connection
    
    this.daemonIo = new MemoryIoAdapter();
    this.replIo = new MemoryIoAdapter();
  }

  async bootDaemon(identity: string) {
    const program = new Command();
    program.option('-d, --db <path>', 'Path to SQLite database');
    registerServeCommand(program, this.daemonIo);
    // Do not await if the action loops indefinitely; but serve action just starts http server and intervals
    program.parseAsync(['node', 'cr', 'serve', '--port', '0', '--identity', identity, '--db', this.dbPath]);
  }

  async bootAuditor() {
    const program = new Command();
    program.option('-d, --db <path>', 'Path to SQLite database');
    // Import dynamically or assume registerAuditorCommand is imported at top
    const { registerAuditorCommand } = await import('../commands/auditor');
    registerAuditorCommand(program);
    program.parseAsync(['node', 'cr', 'serve-auditor', '--db', this.dbPath]);
  }

  async bootRepl(sessionId = 'test-session') {
    const program = new Command();
    program.option('-d, --db <path>', 'Path to SQLite database');
    registerChatCommands(program, this.replIo);
    // Fire and forget since REPL loops until closed
    program.parseAsync(['node', 'cr', 'chat', '--format', 'markdown', '--model', 'gemini-1.5-flash', '--workspace', this.tempDir, '--session', sessionId, '--db', this.dbPath]);
  }

  async triggerDaemonSync(identity: string) {
    const clients = new Set<any>();
    const logger = { 
        info: (m: string) => console.log(m), 
        error: (m: string) => console.error(m),
        warn: (m: string) => console.warn(m)
    };
    await runSyncDaemon(this.db, clients, logger, identity);
  }

  teardown() {
    this.daemonIo.clearAllTimers();
    this.replIo.clearAllTimers();
    this.replIo.closeCallbacks.forEach(cb => cb());
    this.db.close();
    fs.rmSync(this.tempDir, { recursive: true, force: true });
  }
}
