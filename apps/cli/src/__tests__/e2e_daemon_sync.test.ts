import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { runSyncDaemon } from '../commands/serve';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

describe('E2E: Daemon Sync Offline Queuing', () => {
  let db: DatabaseEngine;
  let dbPath: string;
  let tempDir: string;
  let mockLogger: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-daemon-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new DatabaseEngine(dbPath);
    mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
    
    // Silence random logger rate limiting to guarantee error capture
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('verifies events queue offline then flush cleanly on simulated cloud recovery', async () => {
    // 1. Setup local sqlite with out-of-sync events (user types whilst on airplane mode)
    const sessionId = db.createSession('E2E_USER');
    db.appendEvent({ session_id: sessionId, timestamp: Date.now(), actor: 'E2E_USER', type: 'USER_PROMPT', payload: '{"text":"Hello offline!"}', previous_event_id: null });
    db.appendEvent({ session_id: sessionId, timestamp: Date.now()+100, actor: 'LOCAL_AI', type: 'AI_RESPONSE', payload: '{"text":"Response"}', previous_event_id: null });

    // Assert the local DB queue is loaded
    let pending = db.getPendingEvents();
    const initialPendingCount = pending.length;
    expect(initialPendingCount).toBeGreaterThan(0);

    // 2. Simulate CLOUDFLARE API is completely offline/down
    const mockOfflineFetch = vi.fn().mockImplementation((url: string) => {
      // Simulate fetch rejection / timeout
      return Promise.reject(new Error("fetch failed"));
    });
    global.fetch = mockOfflineFetch as any;

    await runSyncDaemon(db, new Set(), mockLogger);

    // Assert events are STILL securely in local queue
    pending = db.getPendingEvents();
    expect(pending.length).toBe(initialPendingCount);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Offline or unreachable'));

    // 3. Simulate CLOUDFLARE API returns to ONLINE
    const mockOnlineFetch = vi.fn().mockImplementation((url: URL | string) => {
      const urlStr = String(url);
      if (urlStr.includes('/batch')) {
         // mock successful push
         return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ events: [] }) });
    });
    global.fetch = mockOnlineFetch as any;

    await runSyncDaemon(db, new Set(), mockLogger);

    // Assert events got successfully flushed to cloud (i.e. local synced flag updated)
    pending = db.getPendingEvents();
    expect(pending.length).toBe(0);
    expect(mockOnlineFetch).toHaveBeenCalled();
  });
});
