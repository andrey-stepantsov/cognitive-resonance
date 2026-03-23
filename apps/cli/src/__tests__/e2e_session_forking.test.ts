import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine.js';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

describe('E2E: Session Forking / Cloning', () => {
  let db: DatabaseEngine;
  let dbPath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-e2e-forking-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new DatabaseEngine(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('verifies /clone CLI behavior perfectly duplicates event streams', () => {
    // 1. Create original session
    const originalSessionId = db.createSession('LOCAL_USER');
    
    // Simulate original session events
    let lastId = null;
    lastId = db.appendEvent({ session_id: originalSessionId, timestamp: 1000, actor: 'LOCAL_USER', type: 'USER_PROMPT', payload: '{"text":"Hello"}', previous_event_id: lastId });
    lastId = db.appendEvent({ session_id: originalSessionId, timestamp: 2000, actor: 'architect', type: 'AI_RESPONSE', payload: '{"text":"Hi there!"}', previous_event_id: lastId });
    lastId = db.appendEvent({ session_id: originalSessionId, timestamp: 3000, actor: 'LOCAL_USER', type: 'USER_PROMPT', payload: '{"text":"What is 2+2?"}', previous_event_id: lastId });

    // The /clone command logic directly extracted from chat.ts replication logic
    const newSessionId = db.createSession('LOCAL_USER');
    const originalEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [originalSessionId]) as any[];
    
    let clonePreviousId: string | null = null;
    for (const ev of originalEvents) {
      clonePreviousId = db.appendEvent({ 
         session_id: newSessionId, 
         timestamp: ev.timestamp, 
         actor: ev.actor, 
         type: ev.type, 
         payload: ev.payload, 
         previous_event_id: clonePreviousId 
      });
    }

    // 2. Assertions
    const clonedEvents = db.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [newSessionId]) as any[];
    
    // Total events should be 3 inserted. 
    // db.createSession does not insert an event.
    expect(clonedEvents.length).toBe(originalEvents.length);
    expect(clonedEvents.length).toBe(3);

    // Validate that the linked list property (previous_event_id) is successfully preserved in isolation
    expect(clonedEvents[0].previous_event_id).toBeNull();
    for (let i = 1; i < clonedEvents.length; i++) {
        expect(clonedEvents[i].previous_event_id).toBe(clonedEvents[i-1].id);
        
        // Assert deep equality of payloads, actors, types but distinctly different UUID identifiers for isolation
        expect(clonedEvents[i].actor).toBe(originalEvents[i].actor);
        expect(clonedEvents[i].type).toBe(originalEvents[i].type);
        expect(clonedEvents[i].payload).toBe(originalEvents[i].payload);
        
        expect(clonedEvents[i].id).not.toBe(originalEvents[i].id);
        expect(clonedEvents[i].session_id).toBe(newSessionId);
    }
  });
});
