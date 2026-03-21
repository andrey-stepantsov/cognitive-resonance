import { Command } from 'commander';
import * as readline from 'readline';
import { initGemini, generateResponse } from '@cr/core/src/services/GeminiService';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

import { registerSimulateCommand } from './commands/simulate';
import { registerAssertCommand } from './commands/assert';
import { registerUserCommands } from './commands/user';
import { registerPortabilityCommands } from './commands/portability';
import { registerServeCommand } from './commands/serve';
import { registerImportExportCommands } from './commands/importExport';

// Path to store the CLI authentication token
const TOKEN_FILE_PATH = path.resolve(process.cwd(), '.cr-cli-token');

// Load env vars, searching upwards if needed
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const program = new Command();

program
  .name('cr')
  .description('Cognitive Resonance Command Line Interface')
  .version('1.0.0')
  .option('-d, --db <path>', 'Global option: Path to SQLite database', '.cr/cr.sqlite');

import { registerChatCommands } from './commands/chat';
import { registerObserveCommands } from './commands/observe';
import { DefaultIoAdapter } from './utils/IoAdapter';
import { registerMcpCommand } from './commands/mcp';
import { registerAdminCommands } from './commands/admin';

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

program.parseAsync(process.argv).catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
