import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import worker, { generateSessionEmbeddings, verifyJwt, verifyAppwriteJwt, clearJwksCache } from '../index';

const TEST_API_KEY = 'test-api-key-abc123';

function makeEnv(overrides: Record<string, any> = {}): any {
  return { API_KEY: TEST_API_KEY, ...overrides };
}

function authHeaders(key = TEST_API_KEY): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

function makeCtx(): any {
  return { waitUntil: vi.fn() };
}

describe('Cloudflare Worker - cr-vector-pipeline', () => {
  it('handles OPTIONS requests for CORS', async () => {
    const request = new Request('http://localhost/api/sessions', { method: 'OPTIONS' });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  // --- Auth enforcement on /api/sessions ---

  it('rejects /api/sessions without Authorization header', async () => {
    const request = new Request('http://localhost/api/sessions', { method: 'GET' });
    const response = await worker.fetch(request, makeEnv(), makeCtx());

    expect(response.status).toBe(401);
    const body = await response.json() as any;
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects /api/sessions with wrong API key', async () => {
    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: authHeaders('wrong-key'),
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());

    expect(response.status).toBe(401);
  });

  it('allows /api/sessions with correct API key', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    };
    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());

    expect(response.status).toBe(200);
  });

  // --- Auth enforcement on /api/gems ---

  it('rejects /api/gems without Authorization header', async () => {
    const request = new Request('http://localhost/api/gems', { method: 'GET' });
    const response = await worker.fetch(request, makeEnv(), makeCtx());

    expect(response.status).toBe(401);
  });

  it('allows /api/gems with correct API key', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    };
    const request = new Request('http://localhost/api/gems', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());

    expect(response.status).toBe(200);
  });

  // --- Git endpoints (existing auth) ---

  it('rejects unauthorized git-receive-pack requests', async () => {
    const request = new Request('http://localhost/git/session-123/git-receive-pack', {
      method: 'POST'
    });
    
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(401);
  });

  it('saves git packfiles to the R2 bucket binding', async () => {
    const encoder = new TextEncoder();
    const mockPackfile = encoder.encode('PACK...mock...data...');
    
    const request = new Request('http://localhost/git/session-123/git-receive-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: mockPackfile
    });

    const mockR2Bucket = {
      put: vi.fn().mockResolvedValue(true)
    };

    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2Bucket }), makeCtx());
    
    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).toContain('unpack ok');
    expect(bodyText).toContain('ok refs/heads/main');

    expect(mockR2Bucket.put).toHaveBeenCalledTimes(1);
    
    const putArgs = mockR2Bucket.put.mock.calls[0];
    const fileName = putArgs[0];
    const payload = putArgs[1];

    // R2 key is now namespaced with userId ('default' in API key fallback mode)
    expect(fileName).toMatch(/^default\/pack-session-123-\d+\.pack$/);
    expect(payload.byteLength).toBe(mockPackfile.byteLength);
  });

  it('handles git-receive-pack without R2 bucket', async () => {
    const encoder = new TextEncoder();
    const request = new Request('http://localhost/git/session-x/git-receive-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: encoder.encode('PACK...data...'),
    });

    // No GIT_PACKS_BUCKET in env
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('unpack ok');
  });

  it('handles git-receive-pack when R2 put fails', async () => {
    const encoder = new TextEncoder();
    const request = new Request('http://localhost/git/session-x/git-receive-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: encoder.encode('PACK...data...'),
    });

    const mockR2Bucket = {
      put: vi.fn().mockRejectedValue(new Error('R2 failure')),
    };

    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2Bucket }), makeCtx());
    expect(response.status).toBe(200); // Still returns success per protocol
  });

  // --- Fallback ---

  it('returns 404 for unknown routes', async () => {
    const request = new Request('http://localhost/unknown', { method: 'GET' });
    const response = await worker.fetch(request, makeEnv(), makeCtx());

    expect(response.status).toBe(404);
  });

  // --- Session GET single ---

  it('returns a single session by ID', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'sess-1', timestamp: 1000, preview: 'Hello', custom_name: 'My Chat',
            config: '{}', data: '{}', is_archived: 0,
          }),
        }),
      }),
    };
    const request = new Request('http://localhost/api/sessions/sess-1', {
      method: 'GET', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.id).toBe('sess-1');
    expect(body.customName).toBe('My Chat');
    expect(body.isCloud).toBe(true);
  });

  it('returns 404 for non-existent session', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    };
    const request = new Request('http://localhost/api/sessions/nonexistent', {
      method: 'GET', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
    expect(response.status).toBe(404);
  });

  // --- Session PUT edge cases ---

  it('returns 400 when PUT has no session ID', async () => {
    const request = new Request('http://localhost/api/sessions', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: '{}' }),
    });
    const response = await worker.fetch(request, makeEnv({ DB: {} }), makeCtx());
    expect(response.status).toBe(400);
  });

  // --- Session PATCH ---

  it('patches session customName', async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: runFn }),
      }),
    };
    const request = new Request('http://localhost/api/sessions/sess-1', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customName: 'Updated Name' }),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.ok).toBe(true);
  });

  it('patches session isArchived', async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: runFn }),
      }),
    };
    const request = new Request('http://localhost/api/sessions/sess-1', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: true }),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
    expect(response.status).toBe(200);
  });

  it('returns 400 when PATCH has nothing to update', async () => {
    const request = new Request('http://localhost/api/sessions/sess-1', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await worker.fetch(request, makeEnv({ DB: {} }), makeCtx());
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toContain('Nothing to update');
  });

  it('returns 400 when PATCH has no session ID', async () => {
    const request = new Request('http://localhost/api/sessions', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ customName: 'test' }),
    });
    const response = await worker.fetch(request, makeEnv({ DB: {} }), makeCtx());
    expect(response.status).toBe(400);
  });

  // --- Session DELETE ---

  it('deletes a session', async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: runFn }),
      }),
    };
    const request = new Request('http://localhost/api/sessions/sess-1', {
      method: 'DELETE', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.ok).toBe(true);
  });

  it('returns 400 when DELETE has no session ID', async () => {
    const request = new Request('http://localhost/api/sessions', {
      method: 'DELETE', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: {} }), makeCtx());
    expect(response.status).toBe(400);
  });

  // --- Sessions unsupported method ---

  it('returns 405 for unsupported sessions method', async () => {
    const request = new Request('http://localhost/api/sessions/sess-1', {
      method: 'POST', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: {} }), makeCtx());
    expect(response.status).toBe(405);
  });

  // --- Gems PUT ---

  it('saves gems config', async () => {
    const runFn = vi.fn().mockResolvedValue({});
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ run: runFn }),
      }),
    };
    const request = new Request('http://localhost/api/gems', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ gems: [], defaultGemId: 'gem-1' }),
    });
    const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.ok).toBe(true);
  });

  it('returns 405 for unsupported gems method', async () => {
    const request = new Request('http://localhost/api/gems', {
      method: 'DELETE', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ DB: {} }), makeCtx());
    expect(response.status).toBe(405);
  });

  // --- Git API (R2-backed) ---

  it('lists packfiles for a session', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [{
          key: 'pack-sess-1-123.pack', size: 1024,
          uploaded: new Date('2024-01-01'),
        }],
      }),
    };
    const request = new Request('http://localhost/api/git/sess-1/packs', {
      method: 'GET', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.sessionId).toBe('sess-1');
    expect(body.packs).toHaveLength(1);
  });

  it('downloads a specific packfile', async () => {
    const mockBody = new ReadableStream();
    const mockR2 = {
      get: vi.fn().mockResolvedValue({
        body: mockBody, httpEtag: '"abc"',
      }),
    };
    const request = new Request('http://localhost/api/git/sess-1/packs/pack-file.pack', {
      method: 'GET', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('returns 404 for missing packfile', async () => {
    const mockR2 = { get: vi.fn().mockResolvedValue(null) };
    const request = new Request('http://localhost/api/git/sess-1/packs/missing.pack', {
      method: 'GET', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid git API path', async () => {
    const request = new Request('http://localhost/api/git/bad-path', {
      method: 'GET', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({}), makeCtx());
    expect(response.status).toBe(400);
  });

  it('returns 405 for non-GET git API method', async () => {
    const request = new Request('http://localhost/api/git/sess-1/packs', {
      method: 'POST', headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({}), makeCtx());
    expect(response.status).toBe(405);
  });

  // --- Git Smart HTTP (info/refs) ---

  it('returns git-receive-pack advertisement for info/refs', async () => {
    const request = new Request('http://localhost/git/session-1/info/refs?service=git-receive-pack', {
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-git-receive-pack-advertisement');
    const body = await response.text();
    expect(body).toContain('git-receive-pack');
  });

  it('rejects unsupported service in info/refs', async () => {
    const request = new Request('http://localhost/git/session-1/info/refs?service=git-foo-bar', {
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Unsupported git service');
  });

  it('returns git-upload-pack advertisement for info/refs', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({ objects: [] }),
    };
    const request = new Request('http://localhost/git/session-1/info/refs?service=git-upload-pack', {
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-git-upload-pack-advertisement');
    const body = await response.text();
    expect(body).toContain('git-upload-pack');
  });

  it('advertises refs/heads/main when packs exist for upload-pack', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [{ key: 'default/pack-session-1-1234.pack', size: 100 }],
      }),
    };
    const request = new Request('http://localhost/git/session-1/info/refs?service=git-upload-pack', {
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('refs/heads/main');
  });

  it('advertises capabilities-only when no packs for upload-pack', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({ objects: [] }),
    };
    const request = new Request('http://localhost/git/session-1/info/refs?service=git-upload-pack', {
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    const body = await response.text();
    expect(body).toContain('capabilities^{}');
  });

  // --- Git Smart HTTP (git-upload-pack POST) ---

  it('rejects unauthorized git-upload-pack requests', async () => {
    const request = new Request('http://localhost/git/session-123/git-upload-pack', {
      method: 'POST',
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(401);
  });

  it('returns NAK when no packs exist for git-upload-pack', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({ objects: [] }),
    };
    const request = new Request('http://localhost/git/session-empty/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: new Uint8Array(0),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-git-upload-pack-result');
    const body = await response.text();
    expect(body).toContain('NAK');
  });

  it('returns pack data when packs exist for git-upload-pack', async () => {
    const packContent = new TextEncoder().encode('PACK-MOCK-DATA');
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [
          { key: 'default/pack-session-1-1000.pack', size: 100 },
          { key: 'default/pack-session-1-2000.pack', size: 200 },
        ],
      }),
      get: vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(packContent.buffer),
      }),
    };
    const request = new Request('http://localhost/git/session-1/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: new Uint8Array(0),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-git-upload-pack-result');
    // Should have fetched the latest pack (highest timestamp key, now namespaced)
    expect(mockR2.get).toHaveBeenCalledWith('default/pack-session-1-2000.pack');
  });

  it('returns 500 when R2 bucket is not configured for git-upload-pack', async () => {
    const request = new Request('http://localhost/git/session-1/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: new Uint8Array(0),
    });
    // No GIT_PACKS_BUCKET in env
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('R2 bucket not configured');
  });

  it('returns 404 when R2 get fails for git-upload-pack', async () => {
    const mockR2 = {
      list: vi.fn().mockResolvedValue({
        objects: [{ key: 'default/pack-session-1-1000.pack', size: 100 }],
      }),
      get: vi.fn().mockResolvedValue(null),
    };
    const request = new Request('http://localhost/git/session-1/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: new Uint8Array(0),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(404);
  });

  // --- WebSocket Rooms ---

  it('returns 400 for room without session ID', async () => {
    const request = new Request('http://localhost/room/', {
      headers: { 'Upgrade': 'websocket' },
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(400);
  });

  it('returns 426 for room without websocket upgrade', async () => {
    const request = new Request('http://localhost/room/session-1');
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(426);
  });

  // --- Session PUT triggers embeddings ---

  it('triggers embedding generation on session PUT via ctx.waitUntil', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    };
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
    };
    const mockVectorize = {
      upsert: vi.fn().mockResolvedValue({}),
    };
    const ctx = makeCtx();

    const sessionData = {
      messages: [{ role: 'user', content: 'Hello world' }],
    };
    const request = new Request('http://localhost/api/sessions/test-session', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: Date.now(),
        preview: 'test',
        data: JSON.stringify(sessionData),
      }),
    });

    const response = await worker.fetch(
      request,
      makeEnv({ DB: mockDB, AI: mockAI, VECTORIZE: mockVectorize }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    // The promise passed to waitUntil should be the embedding promise
    const embeddingPromise = ctx.waitUntil.mock.calls[0][0];
    expect(embeddingPromise).toBeInstanceOf(Promise);
  });

  it('does not error on PUT when AI/Vectorize bindings are missing', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    };
    const ctx = makeCtx();

    const request = new Request('http://localhost/api/sessions/test-session', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: Date.now(),
        preview: 'test',
        data: JSON.stringify({ messages: [{ content: 'hi' }] }),
      }),
    });

    const response = await worker.fetch(
      request,
      makeEnv({ DB: mockDB }),
      ctx,
    );

    expect(response.status).toBe(200);
    // waitUntil is still called, but the promise inside will exit early
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
  });
});

// --- generateSessionEmbeddings unit tests ---

describe('generateSessionEmbeddings', () => {
  it('extracts text from messages and semantic nodes, generates embedding, upserts to Vectorize', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
    };
    const mockVectorize = {
      upsert: vi.fn().mockResolvedValue({}),
    };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    const data = {
      messages: [
        {
          content: 'How does authentication work?',
          internalState: {
            semanticNodes: [
              { id: 'auth', label: 'Authentication' },
              { id: 'oauth', label: 'OAuth Flow' },
            ],
          },
        },
        {
          content: 'It uses JWT tokens.',
        },
      ],
    };

    await generateSessionEmbeddings('session-abc', data, env);

    // AI.run was called with the combined text
    expect(mockAI.run).toHaveBeenCalledTimes(1);
    const aiArgs = mockAI.run.mock.calls[0];
    expect(aiArgs[0]).toBe('@cf/baai/bge-base-en-v1.5');
    expect(aiArgs[1].text[0]).toContain('How does authentication work?');
    expect(aiArgs[1].text[0]).toContain('Authentication, OAuth Flow');
    expect(aiArgs[1].text[0]).toContain('It uses JWT tokens.');

    // Vectorize.upsert was called with the vector (now includes userId)
    expect(mockVectorize.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockVectorize.upsert.mock.calls[0][0];
    expect(upsertArgs).toEqual([{
      id: 'session-abc',
      values: [0.1, 0.2, 0.3],
      metadata: { sessionId: 'session-abc', userId: 'default' },
    }]);
  });

  it('skips embedding when there are no messages', async () => {
    const mockAI = { run: vi.fn() };
    const mockVectorize = { upsert: vi.fn() };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    await generateSessionEmbeddings('session-empty', { messages: [] }, env);

    expect(mockAI.run).not.toHaveBeenCalled();
    expect(mockVectorize.upsert).not.toHaveBeenCalled();
  });

  it('skips embedding when data is null/undefined', async () => {
    const mockAI = { run: vi.fn() };
    const mockVectorize = { upsert: vi.fn() };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    await generateSessionEmbeddings('session-null', null, env);
    await generateSessionEmbeddings('session-undef', undefined, env);

    expect(mockAI.run).not.toHaveBeenCalled();
  });

  it('skips when AI or Vectorize bindings are missing', async () => {
    const env = makeEnv({});
    // Should not throw
    await generateSessionEmbeddings('session-no-bindings', { messages: [{ content: 'hello' }] }, env);
  });

  it('silently catches errors from AI.run', async () => {
    const mockAI = {
      run: vi.fn().mockRejectedValue(new Error('AI service down')),
    };
    const mockVectorize = { upsert: vi.fn() };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    // Should not throw
    await generateSessionEmbeddings('session-err', { messages: [{ content: 'test' }] }, env);
    expect(mockVectorize.upsert).not.toHaveBeenCalled();
  });

  it('silently catches errors from Vectorize.upsert', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }),
    };
    const mockVectorize = {
      upsert: vi.fn().mockRejectedValue(new Error('Vectorize down')),
    };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    // Should not throw
    await generateSessionEmbeddings('session-err2', { messages: [{ content: 'test' }] }, env);
  });

  it('handles messages without content gracefully', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.5]] }),
    };
    const mockVectorize = { upsert: vi.fn().mockResolvedValue({}) };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    const data = {
      messages: [
        { role: 'system' }, // no content
        {
          internalState: {
            semanticNodes: [{ id: 'test', label: 'Test Label' }],
          },
        },
      ],
    };

    await generateSessionEmbeddings('session-partial', data, env);
    expect(mockAI.run).toHaveBeenCalledTimes(1);
    expect(mockAI.run.mock.calls[0][1].text[0]).toContain('Test Label');
  });

  it('skips when AI returns empty embeddings', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[]] }),
    };
    const mockVectorize = { upsert: vi.fn() };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    await generateSessionEmbeddings('session-empty-vec', { messages: [{ content: 'test' }] }, env);
    expect(mockVectorize.upsert).not.toHaveBeenCalled();
  });

  it('truncates combined text to 2000 characters', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1]] }),
    };
    const mockVectorize = { upsert: vi.fn().mockResolvedValue({}) };
    const env = makeEnv({ AI: mockAI, VECTORIZE: mockVectorize });

    const longContent = 'a'.repeat(3000);
    const data = { messages: [{ content: longContent }] };

    await generateSessionEmbeddings('session-long', data, env);

    const textSent = mockAI.run.mock.calls[0][1].text[0];
    // Content is first truncated to 500 per message, then combined is truncated to 2000
    expect(textSent.length).toBeLessThanOrEqual(2000);
  });
});

// --- Search API endpoint tests ---

describe('/api/search endpoint', () => {
  it('requires API key for /api/search', async () => {
    const request = new Request('http://localhost/api/search?q=test', { method: 'GET' });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(401);
  });

  it('returns 400 when q parameter is missing', async () => {
    const request = new Request('http://localhost/api/search', {
      method: 'GET',
      headers: authHeaders(),
    });
    const mockAI = { run: vi.fn() };
    const mockVectorize = { query: vi.fn() };
    const response = await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize }),
      makeCtx(),
    );
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toContain('Missing query parameter');
  });

  it('returns 400 when q parameter is empty', async () => {
    const request = new Request('http://localhost/api/search?q=', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(
      request,
      makeEnv({ AI: { run: vi.fn() }, VECTORIZE: { query: vi.fn() } }),
      makeCtx(),
    );
    expect(response.status).toBe(400);
  });

  it('returns 405 for non-GET methods', async () => {
    const request = new Request('http://localhost/api/search?q=test', {
      method: 'POST',
      headers: authHeaders(),
    });
    const response = await worker.fetch(
      request,
      makeEnv({ AI: { run: vi.fn() }, VECTORIZE: { query: vi.fn() } }),
      makeCtx(),
    );
    expect(response.status).toBe(405);
  });

  it('returns 503 when AI/Vectorize bindings are missing', async () => {
    const request = new Request('http://localhost/api/search?q=test', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(503);
    const body = await response.json() as any;
    expect(body.error).toContain('not configured');
  });

  it('returns empty results when AI produces no embedding', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[]] }),
    };
    const mockVectorize = { query: vi.fn() };
    const request = new Request('http://localhost/api/search?q=test', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize }),
      makeCtx(),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.results).toEqual([]);
    expect(mockVectorize.query).not.toHaveBeenCalled();
  });

  it('returns empty results when Vectorize finds no matches', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] }),
    };
    const mockVectorize = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
    };
    const request = new Request('http://localhost/api/search?q=test', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize }),
      makeCtx(),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.results).toEqual([]);
  });

  it('returns ranked, hydrated search results from Vectorize + D1', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] }),
    };
    const mockVectorize = {
      query: vi.fn().mockResolvedValue({
        matches: [
          { id: 'session-a', score: 0.95 },
          { id: 'session-b', score: 0.80 },
        ],
      }),
    };
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              { id: 'session-a', timestamp: 1000, preview: 'First session', custom_name: 'My Chat' },
              { id: 'session-b', timestamp: 2000, preview: 'Second session', custom_name: null },
            ],
          }),
        }),
      }),
    };

    const request = new Request('http://localhost/api/search?q=authentication', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize, DB: mockDB }),
      makeCtx(),
    );

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.results).toHaveLength(2);

    expect(body.results[0]).toEqual({
      sessionId: 'session-a',
      preview: 'First session',
      customName: 'My Chat',
      score: 0.95,
      timestamp: 1000,
    });
    expect(body.results[1]).toEqual({
      sessionId: 'session-b',
      preview: 'Second session',
      customName: null,
      score: 0.80,
      timestamp: 2000,
    });

    // Verify AI was called with the query
    expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: ['authentication'] });

    // Verify Vectorize was queried with the embedding
    expect(mockVectorize.query).toHaveBeenCalledWith([0.1, 0.2, 0.3], { topK: 10, filter: { userId: 'default' } });
  });

  it('respects custom limit parameter', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1]] }),
    };
    const mockVectorize = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
    };

    const request = new Request('http://localhost/api/search?q=test&limit=5', {
      method: 'GET',
      headers: authHeaders(),
    });
    await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize }),
      makeCtx(),
    );

    expect(mockVectorize.query).toHaveBeenCalledWith([0.1], { topK: 5, filter: { userId: 'default' } });
  });

  it('caps limit at 50', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1]] }),
    };
    const mockVectorize = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
    };

    const request = new Request('http://localhost/api/search?q=test&limit=999', {
      method: 'GET',
      headers: authHeaders(),
    });
    await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize }),
      makeCtx(),
    );

    expect(mockVectorize.query).toHaveBeenCalledWith([0.1], { topK: 50, filter: { userId: 'default' } });
  });

  it('filters out Vectorize matches that are missing from D1', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ data: [[0.1]] }),
    };
    const mockVectorize = {
      query: vi.fn().mockResolvedValue({
        matches: [
          { id: 'exists', score: 0.9 },
          { id: 'deleted', score: 0.8 },
        ],
      }),
    };
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              { id: 'exists', timestamp: 1000, preview: 'Present', custom_name: null },
              // 'deleted' is not in D1
            ],
          }),
        }),
      }),
    };

    const request = new Request('http://localhost/api/search?q=test', {
      method: 'GET',
      headers: authHeaders(),
    });
    const response = await worker.fetch(
      request,
      makeEnv({ AI: mockAI, VECTORIZE: mockVectorize, DB: mockDB }),
      makeCtx(),
    );
    const body = await response.json() as any;
    expect(body.results).toHaveLength(1);
    expect(body.results[0].sessionId).toBe('exists');
  });
});

// --- JWT Auth tests ---

const TEST_JWT_SECRET = 'super-secret-key-for-testing';

/** Helper: create a valid HS256 JWT for testing */
async function createTestJwt(payload: Record<string, any>, secret: string = TEST_JWT_SECRET): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encoder = new TextEncoder();

  const b64url = (data: Uint8Array) => {
    const binary = String.fromCharCode(...data);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(payload)));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${headerB64}.${payloadB64}`),
  );

  const signatureB64 = b64url(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe('verifyJwt', () => {
  it('returns userId from valid JWT with sub claim', async () => {
    const token = await createTestJwt({ sub: 'user-42', exp: Math.floor(Date.now() / 1000) + 3600 });
    const result = await verifyJwt(token, TEST_JWT_SECRET);
    expect(result).toEqual({ userId: 'user-42' });
  });

  it('returns userId from valid JWT with userId claim', async () => {
    const token = await createTestJwt({ userId: 'alice', exp: Math.floor(Date.now() / 1000) + 3600 });
    const result = await verifyJwt(token, TEST_JWT_SECRET);
    expect(result).toEqual({ userId: 'alice' });
  });

  it('returns null for expired JWT', async () => {
    const token = await createTestJwt({ sub: 'user-42', exp: Math.floor(Date.now() / 1000) - 100 });
    const result = await verifyJwt(token, TEST_JWT_SECRET);
    expect(result).toBeNull();
  });

  it('returns null for JWT signed with wrong secret', async () => {
    const token = await createTestJwt({ sub: 'user-42' }, 'wrong-secret');
    const result = await verifyJwt(token, TEST_JWT_SECRET);
    expect(result).toBeNull();
  });

  it('returns null for malformed token', async () => {
    const result = await verifyJwt('not.a.valid.jwt.token', TEST_JWT_SECRET);
    expect(result).toBeNull();
  });

  it('returns null for token without userId/sub', async () => {
    const token = await createTestJwt({ name: 'alice' });
    const result = await verifyJwt(token, TEST_JWT_SECRET);
    expect(result).toBeNull();
  });
});

describe('JWT auth mode', () => {
  it('authenticates with valid JWT when JWT_SECRET is set', async () => {
    const token = await createTestJwt({ sub: 'user-99', exp: Math.floor(Date.now() / 1000) + 3600 });
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    };

    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await worker.fetch(
      request,
      makeEnv({ DB: mockDB, JWT_SECRET: TEST_JWT_SECRET }),
      makeCtx(),
    );

    expect(response.status).toBe(200);
    // The query should use user_id = 'user-99'
    expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'));
  });

  it('rejects expired JWT when JWT_SECRET is set', async () => {
    const token = await createTestJwt({ sub: 'user-99', exp: Math.floor(Date.now() / 1000) - 100 });

    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await worker.fetch(
      request,
      makeEnv({ JWT_SECRET: TEST_JWT_SECRET }),
      makeCtx(),
    );

    expect(response.status).toBe(401);
  });

  it('falls back to API key mode when JWT_SECRET is not set', async () => {
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    };

    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: authHeaders(),  // Uses API key
    });

    const response = await worker.fetch(
      request,
      makeEnv({ DB: mockDB }),  // No JWT_SECRET
      makeCtx(),
    );

    expect(response.status).toBe(200);
  });
});

// --- Appwrite RS256 JWKS tests ---

/** Helper: generate an RSA key pair for RS256 testing */
async function generateRSAKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

/** Helper: create an RS256 JWT */
async function createRS256Jwt(payload: Record<string, any>, privateKey: CryptoKey, kid = 'test-kid'): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const encoder = new TextEncoder();

  const b64url = (data: Uint8Array) => {
    const binary = String.fromCharCode(...data);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerB64 = b64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = b64url(encoder.encode(JSON.stringify(payload)));

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(`${headerB64}.${payloadB64}`),
  );

  const signatureB64 = b64url(new Uint8Array(signature));
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/** Helper: export public key as JWK for mock JWKS endpoint */
async function exportPublicKeyJwk(publicKey: CryptoKey, kid = 'test-kid') {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey) as any;
  return { ...jwk, kid, use: 'sig', alg: 'RS256' };
}

describe('verifyAppwriteJwt (RS256)', () => {
  let keyPair: CryptoKeyPair;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    keyPair = await generateRSAKeyPair();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCache();
  });

  function mockJwksFetch(jwkOverrides?: any) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/account/jwks')) {
        const jwk = jwkOverrides || await exportPublicKeyJwk(keyPair.publicKey);
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      }
      return originalFetch(url);
    }) as any;
  }

  it('verifies a valid RS256 JWT with correct JWKS', async () => {
    mockJwksFetch();
    const token = await createRS256Jwt(
      { userId: 'appwrite-user-42', exp: Math.floor(Date.now() / 1000) + 3600 },
      keyPair.privateKey,
    );

    const result = await verifyAppwriteJwt(token, 'https://cloud.appwrite.io/v1');
    expect(result).toEqual({ userId: 'appwrite-user-42' });
  });

  it('rejects expired RS256 JWT', async () => {
    mockJwksFetch();
    const token = await createRS256Jwt(
      { userId: 'appwrite-user-42', exp: Math.floor(Date.now() / 1000) - 100 },
      keyPair.privateKey,
    );

    const result = await verifyAppwriteJwt(token, 'https://cloud.appwrite.io/v1');
    expect(result).toBeNull();
  });

  it('rejects JWT signed with wrong key', async () => {
    // Generate a different key pair
    const wrongKeys = await generateRSAKeyPair();
    // JWKS serves the original key, but token is signed with the wrong key
    mockJwksFetch();
    const token = await createRS256Jwt(
      { userId: 'attacker', exp: Math.floor(Date.now() / 1000) + 3600 },
      wrongKeys.privateKey,
    );

    const result = await verifyAppwriteJwt(token, 'https://cloud.appwrite.io/v1');
    expect(result).toBeNull();
  });

  it('rejects when JWKS endpoint fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Internal Error', { status: 500 })) as any;

    const token = await createRS256Jwt(
      { userId: 'user', exp: Math.floor(Date.now() / 1000) + 3600 },
      keyPair.privateKey,
    );

    const result = await verifyAppwriteJwt(token, 'https://cloud.appwrite.io/v1');
    expect(result).toBeNull();
  });
});

describe('Appwrite auth in requireAuth pipeline', () => {
  let keyPair: CryptoKeyPair;
  let originalFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    keyPair = await generateRSAKeyPair();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearJwksCache();
  });

  it('authenticates with Appwrite JWT when APPWRITE_ENDPOINT is set', async () => {
    const jwk = await exportPublicKeyJwk(keyPair.publicKey);
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/account/jwks')) {
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      }
      return originalFetch(url);
    }) as any;

    const token = await createRS256Jwt(
      { userId: 'aw-user-99', exp: Math.floor(Date.now() / 1000) + 3600 },
      keyPair.privateKey,
    );

    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    };

    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await worker.fetch(
      request,
      makeEnv({ DB: mockDB, APPWRITE_ENDPOINT: 'https://cloud.appwrite.io/v1' }),
      makeCtx(),
    );

    expect(response.status).toBe(200);
  });

  it('falls back to API key when Appwrite JWT is invalid', async () => {
    // JWKS endpoint returns empty keys
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [] }), { status: 200 })
    ) as any;

    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      }),
    };

    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: authHeaders(),  // Uses API key
    });

    const response = await worker.fetch(
      request,
      makeEnv({ DB: mockDB, APPWRITE_ENDPOINT: 'https://cloud.appwrite.io/v1' }),
      makeCtx(),
    );

    // Should fall through to API key validation
    expect(response.status).toBe(200);
  });
});
