import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as api from '../utils/api.js';
import { TestCluster } from './TestCluster.js';

describe('E2E Auth Morphing', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    // Disable process.exit globally in case REPL tries to close
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('morphs the REPL prompt dynamically after successful Edge Token validation', async () => {
    // Trigger login
    cluster.replIo.simulateLine('/login test@neuro.com');
    // Spy on backendFetch to simulate a successful /api/auth/login to Cloudflare Edge
    vi.spyOn(api, 'backendFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'mock-jwt-token',
        user: { name: 'NeuroMancer', email: 'test@neuro.com' }
      })
    } as Response);

    const saveTokenSpy = vi.spyOn(api, 'saveCliToken').mockImplementation(() => {});

    await cluster.bootRepl('test-session-auth');
    await new Promise(res => setTimeout(res, 50)); // let REPL bind handlers
    
    // Trigger login
    cluster.replIo.simulateLine('/login test@neuro.com');
    await new Promise(res => setTimeout(res, 20)); // let logic settle and call questionHidden
    
    // Answer the password prompt
    cluster.replIo.answerNextQuestion('pass');
    await new Promise(res => setTimeout(res, 50));
    
    expect(saveTokenSpy).toHaveBeenCalledWith('mock-jwt-token');
    expect(cluster.replIo.lastPrompt).toContain('NeuroMancer');
  });

  it('handles WHOAMI Edge validation securely', async () => {
    // Spy to simulate a successful /api/auth/me to Cloudflare Edge
    vi.spyOn(api, 'backendFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { name: 'Cypher', email: 'cypher@matrix.com' }
      })
    } as Response);

    const printSpy = vi.spyOn(cluster.replIo, 'print');

    // Boot repl
    await cluster.bootRepl('test-session-whoami');
    
    // allow initial auto-whoami prompt decorators to settle
    await new Promise(res => setTimeout(res, 50));
    
    cluster.replIo.simulateLine('/whoami');
    await new Promise(res => setTimeout(res, 50));

    // Assert that the CLI outputs the successful identity check
    expect(printSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Logged in as: \x1b[36mCypher\x1b[0m (cypher@matrix.com)'));
  });
});

