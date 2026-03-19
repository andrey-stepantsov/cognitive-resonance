import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleInteractiveCommand, CLIRuntimeState } from '../controllers/CommandHandlers';
import { CommandAction } from '@cr/core/src/services/CommandParser';
import * as api from '../utils/api';
import * as promptUtils from '../utils/prompt';
import { DatabaseEngine } from '../db/DatabaseEngine';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import * as readline from 'readline';

describe('E2E Auth Morphing & Secure Password Interceptor', () => {
  let db: DatabaseEngine;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-auth-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new DatabaseEngine(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('securely mutates stdout when asking for password natively', async () => {
    // Mock the readline interface
    const mockRl = {
      question: vi.fn((query: string, cb: (ans: string) => void) => {
        // Asynchronously answer after a tick
        setTimeout(() => cb('supersecret'), 10);
      }),
      stdoutMuted: false
    } as unknown as readline.Interface;

    // Call our extracted utility
    const promise = promptUtils.askSecure(mockRl, 'Password: ');

    // Immediately after calling, stdoutMuted should be true
    expect((mockRl as any).stdoutMuted).toBe(true);

    const result = await promise;

    // After resolving, stdoutMuted should be back to false
    expect(result).toBe('supersecret');
    expect((mockRl as any).stdoutMuted).toBe(false);
  });

  it('morphs the REPL prompt dynamically after successful Edge Token validation', async () => {
    const mockUpdatePrompt = vi.fn();
    const mockRl = {
      question: vi.fn((q, cb) => cb('pass'))
    } as unknown as readline.Interface;

    const state: CLIRuntimeState = {
      sessionId: 'sess-123',
      currentModel: 'gemini-2.5-flash',
      lastEventId: null,
      chatHistory: []
    };

    // Spy on backendFetch to simulate a successful /api/auth/login to Cloudflare Edge
    vi.spyOn(api, 'backendFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'mock-jwt-token',
        user: { name: 'NeuroMancer', email: 'test@neuro.com' }
      })
    } as Response);

    // Spy on saveCliToken so we don't actually write to ~/.cr/token during tests
    const saveTokenSpy = vi.spyOn(api, 'saveCliToken').mockImplementation(() => {});

    await handleInteractiveCommand({
      state,
      db,
      rl: mockRl,
      text: '/login test@neuro.com',
      command: {
        raw: '/login test@neuro.com',
        action: CommandAction.LOGIN,
        args: ['test@neuro.com', 'mypassword']
      },
      updatePrompt: mockUpdatePrompt,
      loadSessionFromDB: vi.fn()
    });

    expect(saveTokenSpy).toHaveBeenCalledWith('mock-jwt-token');
    
    // The REPL prompt should dynamically morph using the user's fetched name
    expect(mockUpdatePrompt).toHaveBeenCalledWith('NeuroMancer');
  });

  it('handles WHOAMI Edge validation securely', async () => {
    const mockRl = {} as readline.Interface;
    const state: CLIRuntimeState = {
      sessionId: 'sess-123',
      currentModel: 'gemini-2.5-flash',
      lastEventId: null,
      chatHistory: []
    };

    // Spy to simulate a successful /api/auth/me to Cloudflare Edge
    vi.spyOn(api, 'backendFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { name: 'Cypher', email: 'cypher@matrix.com' }
      })
    } as Response);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleInteractiveCommand({
      state,
      db,
      rl: mockRl,
      text: '/whoami',
      command: {
        raw: '/whoami',
        action: CommandAction.WHOAMI,
        args: []
      },
      updatePrompt: vi.fn(),
      loadSessionFromDB: vi.fn()
    });

    // Assert that the CLI outputs the successful identity check
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Logged in as: \x1b[36mCypher\x1b[0m (cypher@matrix.com)'));
  });
});
