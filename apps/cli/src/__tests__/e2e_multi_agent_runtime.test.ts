import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine.js';
import { parseMentions } from '@cr/core/src/services/CommandParser.js';
import { GemProfiles } from '../services/GemRegistry.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import os from 'os';

describe('Phase 15: 3-Player E2E Scenario (Scientist, Architect, Coder)', () => {
  let db: DatabaseEngine;
  let dbPath: string;
  let tempDir: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new DatabaseEngine(dbPath);
    sessionId = db.createSession('E2E_SCIENTIST');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('verifies @ mention routing, AI-to-AI handoffs, and runtime capabilities', () => {
    // 1. Scientist drops a prompt targeting the Architect
    const prompt = "@architect We need a Node.js script that accepts a CLI argument and prints its square. Please plan it and ask @coder to draft it.";
    
    // Core Engine isolates the route parameters
    const mentions1 = parseMentions(prompt);
    
    // Assert parsing detects both but prioritizes existing known profiles via GemRegistry
    expect(mentions1).toContain('architect');
    expect(mentions1).toContain('coder');
    
    const target1 = mentions1.find(m => GemProfiles[m]);
    expect(target1).toBe('architect');

    let timeCursor = Date.now();
    // Simulate appending to the immutable event log
    db.appendEvent({
      session_id: sessionId,
      timestamp: timeCursor++,
      actor: 'SCIENTIST',
      type: 'USER_PROMPT',
      payload: JSON.stringify({ text: prompt }),
      previous_event_id: null
    });

    // 2. Architect analyzes and automatically hands off
    const architectResponse = "I have planned the module. The script should read process.argv[2], parse it to an integer, and print the square. @coder please implement this in square.js.";
    
    const mentions2 = parseMentions(architectResponse);
    // Explicitly prevent self-looping by omitting current actor ('architect')
    const target2 = mentions2.find(m => GemProfiles[m] && m !== 'architect');
    expect(target2).toBe('coder'); // Core engine detects the required autonomous Handoff

    db.appendEvent({
      session_id: sessionId,
      timestamp: timeCursor++,
      actor: 'architect',
      type: 'AI_RESPONSE',
      payload: JSON.stringify({ text: architectResponse, dissonance: 10 }),
      previous_event_id: null
    });

    // 3. Coder drafts the tool 
    // (Simulating the AI safely creating the artefact in the active workspace)
    const scriptPath = path.join(tempDir, 'square.js');
    const coderResponse = "Implementation ready. I have created a draft artefact square.js.";
    
    const scriptContent = `
      const num = parseInt(process.argv[2], 10);
      console.log(num * num);
    `;
    fs.writeFileSync(scriptPath, scriptContent);

    db.appendEvent({
      session_id: sessionId,
      timestamp: timeCursor++,
      actor: 'coder',
      type: 'AI_RESPONSE',
      payload: JSON.stringify({ text: coderResponse, dissonance: 5 }),
      previous_event_id: null
    });

    // 4. Scientist runs the generated module using the /exec runtime capability API
    // In chat.ts this corresponds to `exec(cmd)`
    const cmd = `node square.js 5`;
    const stdout = execSync(cmd, { cwd: tempDir, encoding: 'utf-8' });

    // Assert that the runtime capability safely ran the generated module and intercepted stdout
    expect(stdout.trim()).toBe('25');

    db.appendEvent({
      session_id: sessionId,
      timestamp: timeCursor++,
      actor: 'SYSTEM',
      type: 'RUNTIME_OUTPUT',
      payload: JSON.stringify({ text: stdout.trim() }),
      previous_event_id: null
    });

    // 5. Query event store to assert complete audit trail
    const events = db.query("SELECT actor, type FROM events WHERE session_id = ? AND type != 'SESSION_CREATED' ORDER BY timestamp ASC", [sessionId]) as any[];
    expect(events.length).toBe(4);
    expect(events[0].actor).toBe('SCIENTIST');
    expect(events[1].actor).toBe('architect');
    expect(events[2].actor).toBe('coder');
    expect(events[3].actor).toBe('SYSTEM');
  });
});
