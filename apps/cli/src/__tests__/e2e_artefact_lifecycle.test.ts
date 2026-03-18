import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { ArtefactManager } from '@cr/core/src/services/ArtefactManager';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import git from 'isomorphic-git';

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
      const manager = new ArtefactManager(sessionId, fs, tempDir);
      for (const file of mockFilesResponse.files) {
         const filepath = path.resolve(tempDir, file.path);
         fs.mkdirSync(path.dirname(filepath), { recursive: true });
         fs.writeFileSync(filepath, file.content);
         
         const draft = await manager.proposeDraft(file.path, file.content, 'coder');
         expect(draft.branch).toBeDefined();
         expect(draft.commitSha).toBeDefined();
         
         lastEventId = db.appendEvent({
           session_id: sessionId,
           timestamp: Date.now(),
           actor: 'SYSTEM',
           type: 'ARTEFACT_DRAFT',
           payload: JSON.stringify({ path: file.path, branch: draft.branch, commitSha: draft.commitSha }),
           previous_event_id: lastEventId
         });
      }
    }

    // 3. Assertions

    // Step A: Assert DB event stream correctly captures the generation
    const events = db.query("SELECT * FROM events WHERE type = 'ARTEFACT_DRAFT' AND session_id = ?", [sessionId]) as any[];
    expect(events.length).toBe(1);
    
    const payload = JSON.parse(events[0].payload);
    expect(payload.path).toBe("src/math.js");
    expect(payload.branch).toMatch(/^draft\/src_math\.js\/\d+$/);
    
    // Step B: Assert Isomorphic Git successfully initialized, staged, and branched the proposal
    const branches = await git.listBranches({ fs, dir: tempDir });
    expect(branches).toContain(payload.branch);

    const commits = await git.log({ fs, dir: tempDir, ref: payload.branch, depth: 1 });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0].commit.message.trim()).toBe("Draft proposal for src/math.js");
    expect(commits[0].commit.author.name).toBe("coder");
  });
});
