import { Command } from 'commander';
import * as readline from 'readline';
import { initGemini, generateResponse } from '@cr/core/src/services/GeminiService';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Path to store the CLI authentication token
const TOKEN_FILE_PATH = path.resolve(process.cwd(), '.cr-cli-token');

// Load env vars, searching upwards if needed
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const program = new Command();

program
  .name('cr')
  .description('Cognitive Resonance Command Line Interface')
  .version('1.0.0');

// Helper to reliably read from stdin if piped
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''; // No data piped in
  }
  
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
    
    process.stdin.on('error', err => {
      reject(err);
    });
  });
}

program
  .command('chat <message>')
  .description('Headless execution: Send a one-off message to the AI, optionally piping context via stdin')
  .option('-f, --format <type>', 'Output format (e.g., json, markdown)', 'markdown')
  .option('-m, --model <model>', 'The Gemini model to use', 'gemini-2.5-flash')
  .action(async (message, options) => {
    const apiKey = process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Error: CR_GEMINI_API_KEY or VITE_GEMINI_API_KEY environment variable is missing.');
      process.exit(1);
    }
    
    try {
      initGemini(apiKey);
    } catch (err: any) {
      // Already initialized is fine
    }

    const pipedInput = await readStdin();
    let fullPrompt = message;
    
    if (pipedInput) {
      fullPrompt = `${message}\n\nContext from stdin:\n${pipedInput}`;
    }

    const history = [{ role: 'user', content: fullPrompt }];
    const schema = {
      type: 'OBJECT',
      properties: {
        reply: { type: 'STRING', description: 'Your markdown-formatted response to the user' },
        dissonanceScore: { type: 'INTEGER', description: '0-100 indicating cognitive load' },
        nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, label: { type: 'STRING' } } } }
      },
      required: ['reply', 'dissonanceScore']
    };

    let responsePayload: any;
    try {
      if (options.format !== 'json') {
        process.stdout.write('Thinking...\n');
      }
      responsePayload = await generateResponse(options.model, history, 'You are a helpful CLI assistant.', schema, undefined, false);
    } catch (err: any) {
      if (options.format === 'json') {
        console.error(JSON.stringify({ error: err.message }));
      } else {
        console.error(`\nAPI Error: ${err.message}`);
      }
      process.exit(1);
    }

    if (options.format === 'json') {
      console.log(JSON.stringify({
        role: 'assistant',
        content: responsePayload.reply,
        metadata: {
          dissonanceScore: responsePayload.dissonanceScore,
          nodes: responsePayload.nodes
        }
      }));
    } else {
      console.log('\n🤖 Cognitive Resonance');
      console.log('---------------------');
      console.log(responsePayload.reply);
      console.log(`\n[Dissonance: ${responsePayload.dissonanceScore}/100]`);
    }
  });

import { parseCommand, CommandAction } from '@cr/core/src/services/CommandParser';

/** Read token from disk */
function getCliToken(): string | null {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      return fs.readFileSync(TOKEN_FILE_PATH, 'utf-8').trim();
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
}

/** Save token to disk */
function saveCliToken(token: string) {
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, token, { mode: 0o600 });
  } catch (e) {
    console.error('[Error] Failed to save authentication token:', e);
  }
}

/** Execute fetch to local/remote backend */
async function backendFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const backendUrl = process.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787';
  const url = `${backendUrl.replace(/\/$/, '')}${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  const token = getCliToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return fetch(url, { ...options, headers });
}

// REPL Mode (default action when no arguments are provided)
program.action(async () => {
  if (process.argv.length > 2) {
    // A command was provided but not recognized
    program.help();
    return;
  }

  const apiKey = process.env.CR_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Warning: CR_GEMINI_API_KEY or VITE_GEMINI_API_KEY is not set. Chat will fail until authenticated.');
  } else {
    try {
      initGemini(apiKey);
    } catch (err: any) {}
  }

  console.log('Welcome to Cognitive Resonance! Type /help for commands, or hit Ctrl+C to exit.');
  
  let currentModel = 'gemini-2.5-flash';
  let chatHistory: { role: string; content: string }[] = [];
  
  const schema = {
    type: 'OBJECT',
    properties: {
      reply: { type: 'STRING' },
      dissonanceScore: { type: 'INTEGER' }
    },
    required: ['reply', 'dissonanceScore']
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'cr> '
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    if (text === '/exit' || text === '/quit') {
      rl.close();
      return;
    }

    const command = parseCommand(text);

    if (command) {
      switch (command.action) {
        case CommandAction.SESSION_CLEAR:
          chatHistory = [];
          console.log('[System] Session history cleared.');
          break;
        case CommandAction.MODEL_USE:
          if (command.args[0]) {
            currentModel = command.args[0];
            console.log(`[System] Switched to model: ${currentModel}`);
          } else {
            console.log(`[System] Current model: ${currentModel}`);
          }
          break;
        case CommandAction.LOGIN: {
          const email = command.args[0];
          const password = command.args[1];
          if (!email || !password) {
            console.log('[System] Usage: /login <email> <password>');
            break;
          }
          try {
            process.stdout.write('[System] Logging in... ');
            const res = await backendFetch('/api/auth/login', {
              method: 'POST',
              body: JSON.stringify({ email, password })
            });
            const data = await res.json() as any;
            if (res.ok && data.token) {
              saveCliToken(data.token);
              console.log(`Success! Logged in as ${data.user.name || email}`);
            } else {
              console.log(`Failed. ${data.error || 'Invalid credentials'}`);
            }
          } catch (err: any) {
            console.log(`Failed. Network error: ${err.message}`);
          }
          break;
        }
        case CommandAction.SIGNUP: {
          const email = command.args[0];
          const password = command.args[1];
          const name = command.args.slice(2).join(' ') || email.split('@')[0];
          if (!email || !password) {
            console.log('[System] Usage: /signup <email> <password> [name]');
            break;
          }
          try {
            process.stdout.write('[System] Signing up... ');
            const res = await backendFetch('/api/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ email, password, name })
            });
            const data = await res.json() as any;
            if (res.ok && data.token) {
              saveCliToken(data.token);
              console.log(`Success! Account created for ${email}`);
            } else {
              console.log(`Failed. ${data.error || 'Could not create account'}`);
            }
          } catch (err: any) {
            console.log(`Failed. Network error: ${err.message}`);
          }
          break;
        }
        case CommandAction.INVITE: {
          const sessionId = command.args[0];
          if (!sessionId) {
            console.log('[System] Usage: /invite <sessionId>');
            break;
          }
          try {
            process.stdout.write(`[System] Generating invite link for session ${sessionId}... `);
            const res = await backendFetch('/api/auth/invite', {
              method: 'POST',
              body: JSON.stringify({ sessionId })
            });
            const data = await res.json() as any;
            if (res.ok && data.token) {
              const pwaUrl = process.env.VITE_PWA_URL || 'http://localhost:5173';
              console.log(`\n\n🎉 Invite Link Generated Successfully!`);
              console.log(`🔗 Share this URL: ${pwaUrl}/#${sessionId}?invite=${data.token}\n`);
            } else {
              console.log(`Failed. ${data.error || 'You must be logged in to generate invites.'}`);
            }
          } catch (err: any) {
            console.log(`Failed. Network error: ${err.message}`);
          }
          break;
        }
        case CommandAction.SESSION_ARCHIVE: {
          const sessionId = command.args[0];
          if (!sessionId) {
            console.log('[System] Usage: /session archive <id>');
            break;
          }
          try {
            process.stdout.write(`[System] Archiving session ${sessionId}... `);
            const res = await backendFetch(`/api/sessions/${sessionId}`, {
              method: 'PATCH',
              body: JSON.stringify({ isArchived: true })
            });
            if (res.ok) {
              console.log('Success! Session archived.');
            } else {
              const data = await res.json() as any;
              console.log(`Failed. ${data.error || 'Server error'}`);
            }
          } catch (err: any) {
            console.log(`Failed. Network error: ${err.message}`);
          }
          break;
        }
        case CommandAction.SESSION_RECOVER: {
          const sessionId = command.args[0];
          if (!sessionId) {
            console.log('[System] Usage: /session recover <id>');
            break;
          }
          try {
            process.stdout.write(`[System] Recovering session ${sessionId}... `);
            const res = await backendFetch(`/api/sessions/${sessionId}`, {
              method: 'PATCH',
              body: JSON.stringify({ isArchived: false })
            });
            if (res.ok) {
              console.log('Success! Session recovered.');
            } else {
              const data = await res.json() as any;
              console.log(`Failed. ${data.error || 'Server error'}`);
            }
          } catch (err: any) {
            console.log(`Failed. Network error: ${err.message}`);
          }
          break;
        }
        case CommandAction.SESSION_CLONE: {
          const sessionId = command.args[0];
          if (!sessionId) {
            console.log('[System] Usage: /session clone <id>');
            break;
          }
          try {
            process.stdout.write(`[System] Cloning session ${sessionId}... `);
            const res = await backendFetch(`/api/sessions/${sessionId}/fork`, {
              method: 'POST',
              body: JSON.stringify({})
            });
            const data = await res.json() as any;
            if (res.ok) {
              console.log(`Success! Cloned to new session ID: ${data.id}`);
            } else {
              console.log(`Failed. ${data.error || 'Server error'}`);
            }
          } catch (err: any) {
            console.log(`Failed. Network error: ${err.message}`);
          }
          break;
        }
        case CommandAction.SESSION_DELETE: {
          const sessionId = command.args[0];
          if (!sessionId) {
            console.log('[System] Usage: /session delete <id> [--force]');
            break;
          }
          
          const force = command.args.includes('--force') || command.args.includes('-f');

          const executeDelete = async () => {
            try {
              process.stdout.write(`[System] Permanently deleting session ${sessionId}... `);
              const res = await backendFetch(`/api/sessions/${sessionId}`, {
                method: 'DELETE'
              });
              if (res.ok) {
                console.log('Success! Session deleted.');
              } else {
                const data = await res.json() as any;
                console.log(`Failed. ${data.error || 'Server error'}`);
              }
            } catch (err: any) {
              console.log(`Failed. Network error: ${err.message}`);
            }
          };

          if (force) {
            await executeDelete();
          } else {
            rl.question(`[System] WARNING: Are you sure you want to permanently delete session ${sessionId}? This cannot be undone. [y/N] `, async (answer) => {
              if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                await executeDelete();
              } else {
                console.log('[System] Deletion cancelled.');
              }
              rl.prompt();
            });
            return; // Exit early so we don't call rl.prompt() synchronously
          }
          break;
        }
        case CommandAction.UNKNOWN:
        default:
          console.log(`[System] Unrecognized command: ${command.raw}`);
          break;
      }
      rl.prompt();
      return;
    }

    // It is a chat message
    chatHistory.push({ role: 'user', content: text });
    process.stdout.write('Thinking...\n');

    try {
      const response = await generateResponse(
        currentModel,
        chatHistory,
        'You are a helpful CLI assistant.',
        schema,
        undefined,
        false
      );
      
      console.log(`\n🤖 ${response.reply}\n`);
      chatHistory.push({ role: 'assistant', content: response.reply });
      
    } catch (err: any) {
      console.error(`\nAPI Error: ${err.message}\n`);
      // Pop the failed user message
      chatHistory.pop();
    }
    
    rl.prompt();
  }).on('close', () => {
    console.log('\nSession ended.');
    process.exit(0);
  });
});

program.parseAsync(process.argv).catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
