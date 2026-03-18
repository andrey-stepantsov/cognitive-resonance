import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { DatabaseEngine } from '../src/db/DatabaseEngine';
import { createServerApp } from '../src/commands/serve';
import { WebSocket } from 'ws';

describe('Local CLI Server Endpoints', () => {
  let dbEngine: DatabaseEngine;
  let app: any;
  let clients: Set<WebSocket>;

  beforeEach(() => {
    // isolated memory db for each test
    dbEngine = new DatabaseEngine(':memory:');
    clients = new Set();
    app = createServerApp(dbEngine, clients);
  });

  afterEach(() => {
    dbEngine.close();
  });

  it('GET /api/sessions should return empty array initially', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/sessions should create a session', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ owner_id: 'test-user', id: 'session-123' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('session-123');

    const listRes = await request(app).get('/api/sessions');
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].id).toBe('session-123');
  });

  it('GET /api/events/:sessionId should return events', async () => {
    dbEngine.createSession('test-user', 'session-abc');
    const event = {
      session_id: 'session-abc',
      timestamp: 123456,
      actor: 'system',
      type: 'chat',
      payload: 'hello world',
      previous_event_id: null
    };

    const res = await request(app)
      .post('/api/events')
      .send(event);
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();

    const fetchRes = await request(app).get('/api/events/session-abc');
    expect(fetchRes.status).toBe(200);
    expect(fetchRes.body.length).toBe(1);
    expect(fetchRes.body[0].payload).toBe('hello world');
  });

  it('GET /api/entities should return entities', async () => {
    dbEngine.createSession('test-user', 'session-1');
    const evtId = dbEngine.appendEvent({ session_id: 'session-1', timestamp: 1, actor: 'x', type: 't', payload: 'p', previous_event_id: null });
    const artId = dbEngine.createArtefact('session-1', evtId, 'code', 'let x=1;');
    dbEngine.promoteEntity('my-entity', artId);

    const res = await request(app).get('/api/entities');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('my-entity');
  });

  it('should hit 500 catch blocks for malformed payloads', async () => {
    // Force a DB crash by closing the handle early
    dbEngine.close();
    
    // Attempt session create
    const res1 = await request(app).post('/api/sessions').send({});
    expect(res1.status).toBe(500);

    // Attempt event append
    const res2 = await request(app).post('/api/events').send({ actor: 'missing-fields' });
    expect(res2.status).toBe(500);
  });
});
