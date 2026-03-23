import { DatabaseEngine } from '../DatabaseEngine.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('DatabaseEngine', () => {
  let dbEngine: DatabaseEngine;

  beforeEach(() => {
    dbEngine = new DatabaseEngine(':memory:');
  });

  afterEach(() => {
    dbEngine.close();
  });

  it('should initialize the schema correctly', () => {
    const tables = dbEngine.query("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('artefacts');
    expect(tableNames).toContain('entities');
    expect(tableNames).toContain('workspace_items');
    expect(tableNames).toContain('users');
  });

  it('should create a session and append events', () => {
    const sessionId = dbEngine.createSession('owner-1');
    expect(sessionId).toBeDefined();

    const eventId1 = dbEngine.appendEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      actor: 'USER',
      type: 'CHAT_MESSAGE',
      payload: JSON.stringify({ message: { role: 'user', content: 'Hello AI' } }),
      previous_event_id: null
    });

    const eventId2 = dbEngine.appendEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      actor: 'SYSTEM',
      type: 'CHAT_MESSAGE',
      payload: JSON.stringify({ message: { role: 'model', content: 'Hello Human' } }),
      previous_event_id: eventId1
    });

    const session = dbEngine.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    expect(session.head_event_id).toBe(eventId2);

    const events = dbEngine.query('SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]);
    expect(events.length).toBe(2);
    expect(events[0].id).toBe(eventId1);
    expect(events[1].id).toBe(eventId2);
  });

  it('should create an artefact and promote an entity', () => {
    const sessionId = dbEngine.createSession('owner-1');
    const eventId = dbEngine.appendEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      actor: 'USER',
      type: 'ARTEFACT_PROPOSAL',
      payload: JSON.stringify({ path: 'src/main.ts', patch: 'console.log("hello");', isFullReplacement: true }),
      previous_event_id: null
    });

    const artefactId = dbEngine.createArtefact(sessionId, eventId, 'text/plain', 'console.log("hello");');
    expect(artefactId).toBeDefined();

    const entityId = dbEngine.promoteEntity('MyScript', artefactId);
    expect(entityId).toBeDefined();

    const entity = dbEngine.getEntityByName('MyScript') as any;
    expect(entity.latest_artefact_id).toBe(artefactId);
    expect(entity.previous_artefact_id).toBeNull();

    // Now promote a new artefact
    const newArtefactId = dbEngine.createArtefact(sessionId, eventId, 'text/plain', 'console.log("hello world");', 2);
    dbEngine.promoteEntity('MyScript', newArtefactId);

    const updatedEntity = dbEngine.getEntityByName('MyScript') as any;
    expect(updatedEntity.latest_artefact_id).toBe(newArtefactId);
    expect(updatedEntity.previous_artefact_id).toBe(artefactId);
  });

  it('should upsert and retrieve a user', () => {
    dbEngine.upsertUser({
      id: 'user-1',
      email: 'test@cr.local',
      nick: 'tester',
      password_hash: 'hash123',
      status: 'active'
    });

    let user = dbEngine.getUserByEmail('test@cr.local');
    expect(user).toBeDefined();
    expect(user?.nick).toBe('tester');

    dbEngine.upsertUser({
      id: 'user-1',
      email: 'test@cr.local',
      nick: 'updated-tester',
      password_hash: 'hash456',
      status: 'suspended'
    });

    user = dbEngine.getUserById('user-1');
    expect(user?.nick).toBe('updated-tester');
    expect(user?.status).toBe('suspended');
  });

  describe('Edge Synchronization Engine', () => {
    it('should track pending events and allow marking them as synced', () => {
      const sessionId = dbEngine.createSession('owner-1');
      const eventId1 = dbEngine.appendEvent({
        session_id: sessionId,
        timestamp: Date.now(),
        actor: 'USER',
        type: 'CHAT_MESSAGE',
        payload: JSON.stringify({ message: { role: 'user', content: 'Hello' } }),
        previous_event_id: null
      });

      const pending = dbEngine.getPendingEvents();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe(eventId1);
      expect(pending[0].sync_status).toBe('PENDING');

      dbEngine.markEventsSynced([eventId1]);
      const newPending = dbEngine.getPendingEvents();
      expect(newPending.length).toBe(0);

      const events = dbEngine.query('SELECT * FROM events WHERE id = ?', [eventId1]);
      expect(events[0].sync_status).toBe('SYNCED');
    });

    it('should correctly report the latest event timestamp across sessions', () => {
      expect(dbEngine.getLatestEventTimestamp()).toBe(0);

      const sessionId = dbEngine.createSession('owner-1');
      dbEngine.appendEvent({
        session_id: sessionId,
        timestamp: 1000,
        actor: 'USER',
        type: 'CHAT_MESSAGE',
        payload: JSON.stringify({ message: { role: 'user', content: '{}' } }),
        previous_event_id: null
      });

      expect(dbEngine.getLatestEventTimestamp()).toBe(1000);

      dbEngine.appendEvent({
        session_id: sessionId,
        timestamp: 5000,
        actor: 'USER',
        type: 'CHAT_MESSAGE',
        payload: JSON.stringify({ message: { role: 'user', content: '{}' } }),
        previous_event_id: null
      });

      expect(dbEngine.getLatestEventTimestamp()).toBe(5000);
    });

    it('should safely insert remote events as already SYNCED', () => {
      const remoteEvent = {
        id: 'remote-1',
        session_id: 'remote-session',
        timestamp: 9999,
        actor: 'REMOTE_USER',
        type: 'CHAT_MESSAGE',
        payload: JSON.stringify({ message: { role: 'user', content: 'Remote Data' } }),
        previous_event_id: null
      };

      dbEngine.insertRemoteEvent(remoteEvent);

      // It shouldn't be pending, because we just downloaded it
      const pending = dbEngine.getPendingEvents();
      expect(pending.filter(e => e.id === 'remote-1').length).toBe(0);

      // But it should exist exactly
      const events = dbEngine.query('SELECT * FROM events WHERE id = ?', ['remote-1']);
      expect(events.length).toBe(1);
      expect(events[0].sync_status).toBe('SYNCED');

      // And it should have auto-created a stub session
      const sessions = dbEngine.query('SELECT * FROM sessions WHERE id = ?', ['remote-session']);
      expect(sessions.length).toBe(1);
      
      // Inserting it again should silently ignore (INSERT OR IGNORE)
      dbEngine.insertRemoteEvent(remoteEvent);
      const eventsAgains = dbEngine.query('SELECT * FROM events WHERE id = ?', ['remote-1']);
      expect(eventsAgains.length).toBe(1);
    });
  });
});
