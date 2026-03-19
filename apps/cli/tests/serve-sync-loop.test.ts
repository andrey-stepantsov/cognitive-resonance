import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSyncDaemon, createServerApp } from '../src/commands/serve';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import * as http from 'http';
import express from 'express';
import { AddressInfo } from 'net';
// Removed GitContextManager mock as it's no longer used in the event-sourced sync loop

describe('Focused Backend Sync Integration', () => {
  let centralDb: DatabaseEngine;
  let centralApp: express.Application;
  let server: http.Server;
  let baseUrl: string;

  let userADb: DatabaseEngine;
  let userBDb: DatabaseEngine;
  let mockLogger: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    centralDb = new DatabaseEngine(':memory:');
    centralDb.createSession('system', 'test-session');

    userADb = new DatabaseEngine(':memory:');
    userADb.createSession('local', 'test-session');
    
    userBDb = new DatabaseEngine(':memory:');
    userBDb.createSession('local', 'test-session');

    mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };

    centralApp = createServerApp(centralDb, new Set());
    
    await new Promise<void>((resolve) => {
      server = centralApp.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    process.env.CR_CLOUD_URL = baseUrl;
  });

  afterEach(() => {
    server.close();
    delete process.env.CR_CLOUD_URL;
  });

  it('safely syncs bidirectional messages without triggering infinite loops', async () => {
    // 1. User A creates a message
    userADb.appendEvent({
      session_id: 'test-session',
      timestamp: Date.now(),
      actor: 'User A',
      type: 'USER_PROMPT',
      payload: 'Hello from User A',
      previous_event_id: null
    });

    // 2. User A syncs (pushes to central)
    await runSyncDaemon(userADb, new Set(), mockLogger);

    // Verify it arrived in central
    const centralEvents = centralDb.query('SELECT * FROM events');
    expect(centralEvents.length).toBe(1);
    expect(centralEvents[0].actor).toBe('User A');

    // 3. User B syncs (pulls from central)
    await runSyncDaemon(userBDb, new Set(), mockLogger);

    // Verify User B has the event
    const userBEvents = userBDb.query('SELECT * FROM events');
    expect(userBEvents.length).toBe(1);
    expect(userBEvents[0].actor).toBe('User A');

    // 4. Central Node syncs (should do nothing, since it IS the central node)
    await runSyncDaemon(centralDb, new Set(), mockLogger);

    // 5. Ensure sync completes cleanly without git loops
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('handles remote artefacts normally without infinite looping', async () => {
    // 1. Central node naturally possesses an artefact event (e.g. from an edge worker)
    centralDb.appendEvent({
      session_id: 'test-session',
      timestamp: Date.now(),
      actor: 'AI',
      type: 'MANUAL_OVERRIDE',
      payload: JSON.stringify({ filepath: 'test.py', sha: '1234abc' }),
      previous_event_id: null
    });

    // 2. User A syncs and pulls the artefact event
    await runSyncDaemon(userADb, new Set(), mockLogger);

    // User A should have pulled it
    const userAEvents = userADb.query('SELECT * FROM events');
    expect(userAEvents.length).toBe(1);
    expect(userAEvents[0].type).toBe('MANUAL_OVERRIDE');

    // It SHOULD log that it processed an event without looping
    expect(mockLogger.error).not.toHaveBeenCalled();
    
    // 3. Sync User A AGAIN. It should NOT pull new changes, and definitely should NOT loop.
    await runSyncDaemon(userADb, new Set(), mockLogger);

    // Success implies we survived the double pull
    expect(userADb.query('SELECT * FROM events').length).toBe(1);
  });
});
