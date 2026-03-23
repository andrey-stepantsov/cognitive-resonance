import { Command } from 'commander';
import * as readline from 'readline';
import { initGemini, generateResponse } from '@cr/core/src/services/GeminiService.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

import { registerSimulateCommand } from './commands/simulate.js';
import { registerAssertCommand } from './commands/assert.js';
import { registerUserCommands } from './commands/user.js';
import { registerPortabilityCommands } from './commands/portability.js';
import { registerServeCommand } from './commands/serve.js';
import { registerImportExportCommands } from './commands/importExport.js';

import { CR_DIR } from './utils/api.js';

// Load env vars from the resolved workspace root
dotenv.config({ path: path.join(path.dirname(CR_DIR), '.env') });

const program = new Command();

program
  .name('cr')
  .description('Cognitive Resonance Command Line Interface')
  .version('1.0.0')
  .option('-d, --db <path>', 'Global option: Path to SQLite database', path.join(CR_DIR, 'cr.sqlite'));

import { registerChatCommands } from './commands/chat.js';
import { registerObserveCommands } from './commands/observe.js';
import { DefaultIoAdapter } from './utils/IoAdapter.js';
import { registerMcpCommand } from './commands/mcp.js';
import { registerAdminCommands } from './commands/admin.js';
import { registerAuditorCommand } from './commands/auditor.js';

// Register model 2 commands
registerSimulateCommand(program);
registerAssertCommand(program);
registerUserCommands(program);
registerPortabilityCommands(program);
const io = new DefaultIoAdapter();
registerChatCommands(program, io);
registerObserveCommands(program, io);
registerServeCommand(program, io);
registerMcpCommand(program);
registerImportExportCommands(program);
registerAdminCommands(program);
registerAuditorCommand(program);

program.parseAsync(process.argv).catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
