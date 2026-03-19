import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { ArtefactManager } from '@cr/core/src/services/ArtefactManager';
import { Materializer } from '@cr/core/src/services/Materializer';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

describe('E2E: Artefact Lifecycle Compilation', () => {
  let db: DatabaseEngine;
  let dbPath: string;
  let tempDir: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-artefact-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new DatabaseEngine(dbPath);
    sessionId = db.createSession('E2E_USER');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('verifies AI files output seamlessly converts into Git drafts and Session Events', async () => {
    // 1. Simulating Coder response payload containing `files` array
    const mockFilesResponse = {
      reply: "I have implemented the math helper module.",
      dissonanceScore: 0,
      files: [
        {
          path: "src/math.js",
          content: "export function add(a, b) { return a + b; }\n"
        }
      ]
    };

    let lastEventId: string | null = null;
    
    // 2. Chat loop mock handling files (simulating the execution in chat.ts)
    if (mockFilesResponse.files && Array.isArray(mockFilesResponse.files)) {
      const sessionEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]) as any[];
      const manager = new ArtefactManager(tempDir, sessionEvents);
      for (const file of mockFilesResponse.files) {
         // Simulate AI returning payload. We don't write to disk yet, because ArtefactManager Diff generator 
         // needs to compare against current virtual/physical state which doesn't have this.
         
         const draft = await manager.proposeDraft(file.path, file.content);
         expect(draft.patch).toBeDefined();
         expect(draft.isFullReplacement).toBeDefined();
         
         lastEventId = db.appendEvent({
           session_id: sessionId,
           timestamp: Date.now(),
           actor: 'SYSTEM',
           type: 'ARTEFACT_PROPOSAL',
           payload: JSON.stringify(draft),
           previous_event_id: lastEventId
         });
      }
    }

    // 3. Assertions

    // Step A: Assert DB event stream correctly captures the generation
    const events = db.query("SELECT * FROM events WHERE type = 'ARTEFACT_PROPOSAL' AND session_id = ?", [sessionId]) as any[];
    expect(events.length).toBe(1);
    
    const payload = JSON.parse(events[0].payload);
    expect(payload.path).toBe("src/math.js");
    expect(payload.patch).toContain("+export function add");
    
    // Step B: Removed isomorphic-git check as ArtefactManager no longer performs local commits.
    // Instead we can assert that the Materializer reconstructs the file.
    const materializer = new Materializer(tempDir);
    const virtualFiles = materializer.computeVirtualState(events);
    expect(virtualFiles.get("src/math.js")).toContain("export function add");
  });
});
