import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from 'vitest';
import worker, { generateSessionEmbeddings, checkRateLimit, rateLimitStore } from '../index';
import { verifyJwt } from '../auth';

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
  beforeEach(() => {
    rateLimitStore.clear();
  });

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

  it('parses packfile and stores loose objects in R2 on receive-pack', async () => {
    // Build a valid packfile with a known blob using the pack builder
    const { buildPackfile, gitObjectSha } = await import('../packParser');
    const blobData = new TextEncoder().encode('test content for receive-pack');
    const blobSha = await gitObjectSha('blob', blobData);
    const pack = await buildPackfile([{ sha: blobSha, type: 'blob', data: blobData }]);

    // Build pkt-line command preceding the packfile
    const oldSha = '0'.repeat(40);
    const line = `${oldSha} ${blobSha} refs/heads/main\0report-status\n`;
    const lenHex = (line.length + 4).toString(16).padStart(4, '0');
    const pktLine = new TextEncoder().encode(`${lenHex}${line}0000`);

    // Combine pkt-line + packfile
    const combined = new Uint8Array(pktLine.length + pack.length);
    combined.set(pktLine);
    combined.set(pack, pktLine.length);

    const request = new Request('http://localhost/git/session-123/git-receive-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: combined,
    });

    const mockR2Bucket = {
      put: vi.fn().mockResolvedValue(true),
    };

    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2Bucket }), makeCtx());

    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).toContain('unpack ok');
    expect(bodyText).toContain('ok refs/heads/main');

    // Should store loose object + ref
    expect(mockR2Bucket.put).toHaveBeenCalled();
    const putCalls = mockR2Bucket.put.mock.calls;
    // At least one call should be for the object, one for the ref
    const objectCall = putCalls.find((c: any[]) => c[0].includes('/objects/'));
    const refCall = putCalls.find((c: any[]) => c[0].includes('/refs/'));
    expect(objectCall).toBeTruthy();
    expect(refCall).toBeTruthy();
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

  it('handles git-receive-pack with invalid packfile gracefully', async () => {
    const encoder = new TextEncoder();
    const request = new Request('http://localhost/git/session-x/git-receive-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: encoder.encode('INVALID-DATA'),
    });

    const mockR2Bucket = {
      put: vi.fn().mockResolvedValue(true),
    };

    // Should still return 200 (error is handled gracefully)
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2Bucket }), makeCtx());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('unpack ok');
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

  // --- Events Sync (D1) ---

  describe('/api/events', () => {
    it('returns newly synced events on GET', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({
              results: [
                { id: 'evt-1', session_id: 'sess-1', timestamp: 100, actor: 'user', type: 'msg', payload: '{}', previous_event_id: null }
              ]
            }),
          }),
        }),
      };
      const request = new Request('http://localhost/api/events?since=50', {
        method: 'GET', headers: authHeaders(),
      });
      const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.events).toHaveLength(1);
      expect(body.events[0].id).toBe('evt-1');
    });

    it('rejects POST to non-batch endpoint', async () => {
      const request = new Request('http://localhost/api/events', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [] })
      });
      const response = await worker.fetch(request, makeEnv(), makeCtx());
      expect(response.status).toBe(400);
    });

    it('accepts valid POST to /api/events/batch', async () => {
      const mockDB = {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn() }),
        batch: vi.fn().mockResolvedValue([{}]),
      };
      const request = new Request('http://localhost/api/events/batch', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            { id: 'evt-1', session_id: 'sess-1', timestamp: 100, actor: 'user', type: 'msg', payload: { foo: 'bar' } }
          ]
        })
      });
      const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
      expect(response.status).toBe(200);
      
      const body = await response.json() as any;
      expect(body.ok).toBe(true);
      expect(mockDB.batch).toHaveBeenCalledTimes(1);
    });
    
    it('returns ok early for empty batch', async () => {
       const mockDB = { batch: vi.fn() };
       const request = new Request('http://localhost/api/events/batch', {
         method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
         body: JSON.stringify({ events: [] })
       });
       const response = await worker.fetch(request, makeEnv({ DB: mockDB }), makeCtx());
       expect(response.status).toBe(200);
       expect(mockDB.batch).not.toHaveBeenCalled();
    });

    it('handles malformed JSON payload', async () => {
       const request = new Request('http://localhost/api/events/batch', {
         method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
         body: '{bad json'
       });
       const response = await worker.fetch(request, makeEnv({}), makeCtx());
       expect(response.status).toBe(400);
       const body = await response.json() as any;
       expect(body.error).toBeDefined();
    });
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

  it('returns git-upload-pack advertisement for info/refs (no ref)', async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
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

  it('advertises real SHA on refs/heads/main when ref exists', async () => {
    const realSha = 'a'.repeat(40);
    const mockR2 = {
      get: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(realSha),
      }),
    };
    const request = new Request('http://localhost/git/session-1/info/refs?service=git-upload-pack', {
      headers: authHeaders(),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(realSha);
    expect(body).toContain('refs/heads/main');
  });

  it('advertises capabilities-only when no ref exists for upload-pack', async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
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

  it('returns NAK when no ref exists for git-upload-pack', async () => {
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
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

  it('returns pack data from loose objects for git-upload-pack', async () => {
    const blobData = new TextEncoder().encode('loose object data');
    const { gitObjectSha } = await import('../packParser');
    const blobSha = await gitObjectSha('blob', blobData);
    const headSha = blobSha;

    const mockR2 = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key.includes('/refs/')) {
          return Promise.resolve({ text: () => Promise.resolve(headSha) });
        }
        if (key.includes('/objects/')) {
          return Promise.resolve({
            arrayBuffer: () => Promise.resolve(blobData.buffer),
            customMetadata: { type: 'blob' },
          });
        }
        return Promise.resolve(null);
      }),
      list: vi.fn().mockResolvedValue({
        objects: [{ key: `default/objects/${blobSha.slice(0, 2)}/${blobSha.slice(2)}` }],
        truncated: false,
      }),
    };

    // Build want line
    const wantLine = `want ${headSha}\n`;
    const wantLen = (wantLine.length + 4).toString(16).padStart(4, '0');
    const doneLine = 'done\n';
    const doneLen = (doneLine.length + 4).toString(16).padStart(4, '0');
    const bodyData = new TextEncoder().encode(
      `${wantLen}${wantLine}0000${doneLen}${doneLine}0000`
    );

    const request = new Request('http://localhost/git/session-1/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: bodyData,
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/x-git-upload-pack-result');
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

  it('returns NAK when ref exists but no loose objects match wants', async () => {
    const headSha = 'f'.repeat(40);
    const mockR2 = {
      get: vi.fn().mockImplementation((key: string) => {
        if (key.includes('/refs/')) {
          return Promise.resolve({ text: () => Promise.resolve(headSha) });
        }
        return Promise.resolve(null);
      }),
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    };
    const request = new Request('http://localhost/git/session-1/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: new Uint8Array(0),
    });
    const response = await worker.fetch(request, makeEnv({ GIT_PACKS_BUCKET: mockR2 }), makeCtx());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('NAK');
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

  it('returns 401 for room when unauthenticated', async () => {
    const request = new Request('http://localhost/room/session-1', {
      headers: { 'Upgrade': 'websocket' }, // Missing auth
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(401);
  });

  it('delegates to Durable Object when authenticated via query token', async () => {
    const mockResponse = new Response(null, { status: 200 });
    Object.defineProperty(mockResponse, 'status', { value: 101 });
    const mockDO = {
      fetch: vi.fn().mockResolvedValue(mockResponse),
    };
    const mockEnv = makeEnv({
      ROOM_SESSION: {
        idFromName: vi.fn().mockReturnValue('mock-id'),
        get: vi.fn().mockReturnValue(mockDO),
      },
    });

    const request = new Request('http://localhost/room/session-1?token=test-api-key-abc123', {
      headers: { 'Upgrade': 'websocket' },
    });
    const response = await worker.fetch(request, mockEnv, makeCtx());
    
    expect(response.status).toBe(101);
    expect(mockEnv.ROOM_SESSION.idFromName).toHaveBeenCalledWith('session-1');
    expect(mockDO.fetch).toHaveBeenCalled();
    const passedReq = mockDO.fetch.mock.calls[0][0] as Request;
    // `token=test-api-key-abc123` uses API key mode -> userId='default'
    expect(passedReq.headers.get('X-User-Id')).toBe('default');
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
  beforeEach(() => {
    rateLimitStore.clear();
  });

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


// --- Rate Limiting ---

describe('checkRateLimit', () => {
  afterEach(() => {
    rateLimitStore.clear();
  });

  it('allows requests under the limit', () => {
    for (let i = 0; i < 59; i++) {
      expect(checkRateLimit('192.168.1.1')).toBe(true);
    }
  });

  it('blocks requests over the limit', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('192.168.1.2');
    }
    expect(checkRateLimit('192.168.1.2')).toBe(false);
  });

  it('tracks IPs independently', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('10.0.0.1');
    }
    // 10.0.0.1 is blocked
    expect(checkRateLimit('10.0.0.1')).toBe(false);
    // 10.0.0.2 should still be allowed
    expect(checkRateLimit('10.0.0.2')).toBe(true);
  });

  it('allows requests after the window expires', () => {
    const realDateNow = Date.now;
    let mockTime = 1000000;
    Date.now = () => mockTime;

    try {
      for (let i = 0; i < 60; i++) {
        checkRateLimit('192.168.1.3');
      }
      expect(checkRateLimit('192.168.1.3')).toBe(false);

      // Advance time past the window (61 seconds)
      mockTime += 61_000;
      expect(checkRateLimit('192.168.1.3')).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('Rate limiting integration', () => {
  afterEach(() => {
    rateLimitStore.clear();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    // Exhaust the rate limit for IP 1.2.3.4
    for (let i = 0; i < 60; i++) {
      checkRateLimit('1.2.3.4');
    }

    const request = new Request('http://localhost/api/sessions', {
      method: 'GET',
      headers: { ...authHeaders(), 'CF-Connecting-IP': '1.2.3.4' },
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    expect(response.status).toBe(429);
    expect(await response.text()).toContain('Rate limit exceeded');
  });

  it('does not rate-limit CORS preflight', async () => {
    // Exhaust the limit for this IP
    for (let i = 0; i < 60; i++) {
      checkRateLimit('5.6.7.8');
    }

    const request = new Request('http://localhost/api/sessions', {
      method: 'OPTIONS',
      headers: { 'CF-Connecting-IP': '5.6.7.8' },
    });
    const response = await worker.fetch(request, makeEnv(), makeCtx());
    // OPTIONS should always return 204, not 429
    expect(response.status).toBe(204);
  });
});

// ─── Git Smart HTTP — Full Round-Trip Integration ────────────────

describe('Git Smart HTTP — full round-trip', () => {
  /**
   * Stateful in-memory R2 mock that persists data across put/get/list calls.
   * This allows the push (receive-pack) to store objects, and the pull
   * (upload-pack) to retrieve them in the same test.
   */
  function makeStatefulR2() {
    const store = new Map<string, { data: Uint8Array; metadata: Record<string, string> }>();

    return {
      store, // exposed for assertions
      put: vi.fn(async (key: string, data: any, options?: any) => {
        let bytes: Uint8Array;
        if (typeof data === 'string') {
          bytes = new TextEncoder().encode(data);
        } else if (data instanceof Uint8Array) {
          bytes = data;
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else {
          // ReadableStream or other — just store as-is (won't happen in tests)
          bytes = new Uint8Array(0);
        }
        store.set(key, {
          data: bytes,
          metadata: options?.customMetadata || {},
        });
      }),
      get: vi.fn(async (key: string) => {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          text: async () => new TextDecoder().decode(entry.data),
          arrayBuffer: async () => entry.data.buffer.slice(
            entry.data.byteOffset,
            entry.data.byteOffset + entry.data.byteLength,
          ),
          customMetadata: entry.metadata,
          httpEtag: '"mock"',
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(entry.data);
              controller.close();
            },
          }),
        };
      }),
      list: vi.fn(async (opts?: { prefix?: string; cursor?: string }) => {
        const prefix = opts?.prefix || '';
        const objects = Array.from(store.keys())
          .filter(k => k.startsWith(prefix))
          .map(key => ({ key, size: store.get(key)!.data.length }));
        return { objects, truncated: false };
      }),
    };
  }

  it('push → info-refs → pull round-trip with blob + tree + commit', async () => {
    const { buildPackfile, gitObjectSha, parsePackfile } = await import('../packParser');

    // ── 1. Build a realistic commit graph ──

    const blobContent = 'Hello from E2E round-trip test!\n';
    const blobData = new TextEncoder().encode(blobContent);
    const blobSha = await gitObjectSha('blob', blobData);

    // Tree entry: "100644 hello.txt\0<20-byte raw SHA>"
    const modeAndName = new TextEncoder().encode('100644 hello.txt\0');
    const shaBytes = new Uint8Array(20);
    for (let i = 0; i < 40; i += 2) {
      shaBytes[i / 2] = parseInt(blobSha.substring(i, i + 2), 16);
    }
    const treeData = new Uint8Array(modeAndName.length + 20);
    treeData.set(modeAndName);
    treeData.set(shaBytes, modeAndName.length);
    const treeSha = await gitObjectSha('tree', treeData);

    const commitText = [
      `tree ${treeSha}`,
      `author Test User <test@example.com> 1700000000 +0000`,
      `committer Test User <test@example.com> 1700000000 +0000`,
      ``,
      `E2E round-trip test commit`,
      ``,
    ].join('\n');
    const commitData = new TextEncoder().encode(commitText);
    const commitSha = await gitObjectSha('commit', commitData);

    // ── 2. Build packfile ──

    const pack = await buildPackfile([
      { sha: blobSha, type: 'blob', data: blobData },
      { sha: treeSha, type: 'tree', data: treeData },
      { sha: commitSha, type: 'commit', data: commitData },
    ]);

    // ── 3. Push via git-receive-pack ──

    const oldSha = '0'.repeat(40);
    const cmdLine = `${oldSha} ${commitSha} refs/heads/main\0report-status\n`;
    const cmdLen = (cmdLine.length + 4).toString(16).padStart(4, '0');
    const pktLine = new TextEncoder().encode(`${cmdLen}${cmdLine}0000`);

    const pushBody = new Uint8Array(pktLine.length + pack.length);
    pushBody.set(pktLine);
    pushBody.set(pack, pktLine.length);

    const r2 = makeStatefulR2();
    const env = makeEnv({ GIT_PACKS_BUCKET: r2 });

    const pushReq = new Request('http://localhost/git/test-session/git-receive-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: pushBody,
    });
    const pushResp = await worker.fetch(pushReq, env, makeCtx());

    expect(pushResp.status).toBe(200);
    const pushText = await pushResp.text();
    expect(pushText).toContain('unpack ok');
    expect(pushText).toContain('ok refs/heads/main');

    // ── 4. Verify R2 state ──

    // Should have 3 loose objects + 1 ref
    const objectKeys = Array.from(r2.store.keys()).filter(k => k.includes('/objects/'));
    const refKeys = Array.from(r2.store.keys()).filter(k => k.includes('/refs/'));
    expect(objectKeys).toHaveLength(3);
    expect(refKeys).toHaveLength(1);

    // Verify ref points to our commit SHA
    const refEntry = r2.store.get(refKeys[0])!;
    expect(new TextDecoder().decode(refEntry.data)).toBe(commitSha);

    // Verify loose object key format: {userId}/objects/{2-char prefix}/{38-char rest}
    for (const key of objectKeys) {
      expect(key).toMatch(/^default\/objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/);
    }

    // Verify type metadata on stored objects
    const blobKey = `default/objects/${blobSha.slice(0, 2)}/${blobSha.slice(2)}`;
    const treeKey = `default/objects/${treeSha.slice(0, 2)}/${treeSha.slice(2)}`;
    const commitKey = `default/objects/${commitSha.slice(0, 2)}/${commitSha.slice(2)}`;
    expect(r2.store.get(blobKey)!.metadata.type).toBe('blob');
    expect(r2.store.get(treeKey)!.metadata.type).toBe('tree');
    expect(r2.store.get(commitKey)!.metadata.type).toBe('commit');

    // ── 5. Verify info/refs advertises the commit SHA ──

    const infoRefsReq = new Request(
      'http://localhost/git/test-session/info/refs?service=git-upload-pack',
      { headers: authHeaders() },
    );
    const infoRefsResp = await worker.fetch(infoRefsReq, env, makeCtx());
    expect(infoRefsResp.status).toBe(200);
    const infoBody = await infoRefsResp.text();
    expect(infoBody).toContain(commitSha);
    expect(infoBody).toContain('refs/heads/main');

    // ── 6. Pull via git-upload-pack ──

    const wantLine = `want ${commitSha}\n`;
    const wantLen = (wantLine.length + 4).toString(16).padStart(4, '0');
    const doneLine = 'done\n';
    const doneLen = (doneLine.length + 4).toString(16).padStart(4, '0');
    const pullBody = new TextEncoder().encode(
      `${wantLen}${wantLine}0000${doneLen}${doneLine}0000`,
    );

    const pullReq = new Request('http://localhost/git/test-session/git-upload-pack', {
      method: 'POST',
      headers: authHeaders(),
      body: pullBody,
    });
    const pullResp = await worker.fetch(pullReq, env, makeCtx());

    expect(pullResp.status).toBe(200);
    expect(pullResp.headers.get('Content-Type')).toBe('application/x-git-upload-pack-result');

    // ── 7. Parse the response and verify data integrity ──

    const pullBytes = new Uint8Array(await pullResp.arrayBuffer());

    // Response format: <NAK pkt-line> <sideband pkt-line with pack data> <flush>
    // Find the NAK line
    const pullText = new TextDecoder().decode(pullBytes);
    expect(pullText).toContain('NAK');

    // Extract sideband pack data: skip NAK pkt-line, read sideband length, skip channel byte
    const nakLineStr = 'NAK\n';
    const nakPktLen = (nakLineStr.length + 4).toString(16).padStart(4, '0');
    const nakTotalLen = nakPktLen.length + nakLineStr.length;

    // Read sideband pkt-line length (4 hex chars after NAK)
    const sidebandLenHex = new TextDecoder().decode(pullBytes.slice(nakTotalLen, nakTotalLen + 4));
    const sidebandLen = parseInt(sidebandLenHex, 16);
    expect(sidebandLen).toBeGreaterThan(12); // at least pack header + channel byte

    // Sideband data starts after the 4-byte length field
    const sidebandStart = nakTotalLen + 4;
    const sidebandData = pullBytes.slice(sidebandStart, sidebandStart + sidebandLen - 4);

    // First byte is the channel (0x01 = pack data)
    expect(sidebandData[0]).toBe(0x01);
    const packData = sidebandData.slice(1);

    // Verify it's a valid PACK
    expect(String.fromCharCode(packData[0], packData[1], packData[2], packData[3])).toBe('PACK');

    // Parse the packfile
    const pulledObjects = await parsePackfile(packData.buffer.slice(
      packData.byteOffset,
      packData.byteOffset + packData.byteLength,
    ));

    // Should have all 3 objects
    expect(pulledObjects).toHaveLength(3);

    // Verify SHAs match
    const pulledShas = pulledObjects.map(o => o.sha).sort();
    expect(pulledShas).toEqual([blobSha, commitSha, treeSha].sort());

    // Verify blob content round-tripped correctly
    const pulledBlob = pulledObjects.find(o => o.sha === blobSha)!;
    expect(pulledBlob.type).toBe('blob');
    expect(new TextDecoder().decode(pulledBlob.data)).toBe(blobContent);

    // Verify tree data round-tripped correctly
    const pulledTree = pulledObjects.find(o => o.sha === treeSha)!;
    expect(pulledTree.type).toBe('tree');
    expect(Array.from(pulledTree.data)).toEqual(Array.from(treeData));

    // Verify commit data round-tripped correctly
    const pulledCommit = pulledObjects.find(o => o.sha === commitSha)!;
    expect(pulledCommit.type).toBe('commit');
    expect(new TextDecoder().decode(pulledCommit.data)).toBe(commitText);
  });

  it('pull stops at have-boundary (incremental fetch)', async () => {
    const { buildPackfile, gitObjectSha } = await import('../packParser');

    // Create two commits: parent → child
    const blob1Data = new TextEncoder().encode('first version');
    const blob1Sha = await gitObjectSha('blob', blob1Data);

    const tree1Entry = new TextEncoder().encode('100644 file.txt\0');
    const sha1Bytes = new Uint8Array(20);
    for (let i = 0; i < 40; i += 2) sha1Bytes[i / 2] = parseInt(blob1Sha.substring(i, i + 2), 16);
    const tree1Data = new Uint8Array(tree1Entry.length + 20);
    tree1Data.set(tree1Entry);
    tree1Data.set(sha1Bytes, tree1Entry.length);
    const tree1Sha = await gitObjectSha('tree', tree1Data);

    const commit1Text = `tree ${tree1Sha}\nauthor A <a@b> 1000 +0000\ncommitter A <a@b> 1000 +0000\n\nfirst\n`;
    const commit1Data = new TextEncoder().encode(commit1Text);
    const commit1Sha = await gitObjectSha('commit', commit1Data);

    // Second commit (child of first)
    const blob2Data = new TextEncoder().encode('second version');
    const blob2Sha = await gitObjectSha('blob', blob2Data);

    const tree2Entry = new TextEncoder().encode('100644 file.txt\0');
    const sha2Bytes = new Uint8Array(20);
    for (let i = 0; i < 40; i += 2) sha2Bytes[i / 2] = parseInt(blob2Sha.substring(i, i + 2), 16);
    const tree2Data = new Uint8Array(tree2Entry.length + 20);
    tree2Data.set(tree2Entry);
    tree2Data.set(sha2Bytes, tree2Entry.length);
    const tree2Sha = await gitObjectSha('tree', tree2Data);

    const commit2Text = `tree ${tree2Sha}\nparent ${commit1Sha}\nauthor A <a@b> 2000 +0000\ncommitter A <a@b> 2000 +0000\n\nsecond\n`;
    const commit2Data = new TextEncoder().encode(commit2Text);
    const commit2Sha = await gitObjectSha('commit', commit2Data);

    // Push both commits
    const pack = await buildPackfile([
      { sha: blob1Sha, type: 'blob', data: blob1Data },
      { sha: tree1Sha, type: 'tree', data: tree1Data },
      { sha: commit1Sha, type: 'commit', data: commit1Data },
      { sha: blob2Sha, type: 'blob', data: blob2Data },
      { sha: tree2Sha, type: 'tree', data: tree2Data },
      { sha: commit2Sha, type: 'commit', data: commit2Data },
    ]);

    const cmdLine = `${'0'.repeat(40)} ${commit2Sha} refs/heads/main\0report-status\n`;
    const cmdLen = (cmdLine.length + 4).toString(16).padStart(4, '0');
    const pktLine = new TextEncoder().encode(`${cmdLen}${cmdLine}0000`);
    const pushBody = new Uint8Array(pktLine.length + pack.length);
    pushBody.set(pktLine);
    pushBody.set(pack, pktLine.length);

    const r2 = makeStatefulR2();
    const env = makeEnv({ GIT_PACKS_BUCKET: r2 });

    await worker.fetch(
      new Request('http://localhost/git/s/git-receive-pack', {
        method: 'POST', headers: authHeaders(), body: pushBody,
      }),
      env, makeCtx(),
    );

    // Now pull with "have commit1Sha" — should only get commit2 + tree2 + blob2
    const wantLine = `want ${commit2Sha}\n`;
    const wantLen = (wantLine.length + 4).toString(16).padStart(4, '0');
    const haveLine = `have ${commit1Sha}\n`;
    const haveLen = (haveLine.length + 4).toString(16).padStart(4, '0');
    const doneLine = 'done\n';
    const doneLen = (doneLine.length + 4).toString(16).padStart(4, '0');
    const pullBody = new TextEncoder().encode(
      `${wantLen}${wantLine}0000${haveLen}${haveLine}${doneLen}${doneLine}0000`,
    );

    const pullResp = await worker.fetch(
      new Request('http://localhost/git/s/git-upload-pack', {
        method: 'POST', headers: authHeaders(), body: pullBody,
      }),
      env, makeCtx(),
    );

    expect(pullResp.status).toBe(200);

    // Parse response — extract pack from sideband
    const pullBytes = new Uint8Array(await pullResp.arrayBuffer());
    const nakStr = 'NAK\n';
    const nakPktLen = (nakStr.length + 4).toString(16).padStart(4, '0');
    const nakTotal = nakPktLen.length + nakStr.length;

    const sidebandLenHex = new TextDecoder().decode(pullBytes.slice(nakTotal, nakTotal + 4));
    const sidebandLen = parseInt(sidebandLenHex, 16);
    const sideband = pullBytes.slice(nakTotal + 4, nakTotal + 4 + sidebandLen - 4);
    const packData = sideband.slice(1); // skip channel byte

    const { parsePackfile } = await import('../packParser');
    const objects = await parsePackfile(packData.buffer.slice(
      packData.byteOffset,
      packData.byteOffset + packData.byteLength,
    ));

    // BFS stops at commit1Sha (the "have" boundary), so we should get:
    // commit2 (wanted) + tree2 (referenced by commit2) + blob2 (referenced by tree2)
    // But NOT commit1, tree1, or blob1
    const pulledShas = objects.map(o => o.sha);
    expect(pulledShas).toContain(commit2Sha);
    expect(pulledShas).toContain(tree2Sha);
    expect(pulledShas).toContain(blob2Sha);
    expect(pulledShas).not.toContain(commit1Sha);
    expect(pulledShas).not.toContain(tree1Sha);
    expect(pulledShas).not.toContain(blob1Sha);
  });
});

// --- Auth API Integration Tests ---
describe('Auth API (Integration)', () => {
  function makeAuthMockDB() {
    const users: any[] = [];
    const apiKeys: any[] = [];
    
    return {
      prepare: (query: string) => ({
        bind: (...args: any[]) => {
          const exec = async () => {
            if (query.startsWith('SELECT id, email')) {
              return { results: [users.find(u => u.id === args[0])].filter(Boolean) };
            }
            if (query.startsWith('SELECT * FROM users WHERE email')) {
              return { results: [users.find(u => u.email === args[0])].filter(Boolean) };
            }
            if (query.startsWith('SELECT user_id FROM api_keys')) {
              const res = apiKeys.find(k => k.key_hash === args[0]);
              return { results: [res].filter(Boolean) };
            }
            if (query.startsWith('SELECT key_hash, name, created_at')) {
              return { results: apiKeys.filter(k => k.user_id === args[0]) };
            }
            if (query.startsWith('INSERT INTO users')) {
              if (users.find(u => u.email === args[1])) {
                throw new Error('D1_ERROR: UNIQUE constraint failed: users.email');
              }
              const user = { id: args[0], email: args[1], password_hash: args[2], name: args[3] };
              users.push(user);
              return { results: [user] };
            }
            if (query.startsWith('INSERT INTO api_keys')) {
              const key = { key_hash: args[0], user_id: args[1], name: args[2], created_at: new Date().toISOString(), last_used_at: null };
              apiKeys.push(key);
              return { results: [key] };
            }
            if (query.startsWith('DELETE FROM api_keys')) {
              const idx = apiKeys.findIndex(k => k.key_hash === args[0] && k.user_id === args[1]);
              if (idx > -1) apiKeys.splice(idx, 1);
              return { results: [] };
            }
            if (query.startsWith('UPDATE api_keys')) {
              return { results: [] };
            }
            return { results: [] };
          };
          return {
            first: async () => (await exec()).results[0] || null,
            run: async () => await exec(),
            all: async () => await exec(),
          };
        }
      })
    };
  }

  it('should sign up a new user, log them in, and manage API keys', async () => {
    const mockDB = makeAuthMockDB();
    const env = makeEnv({ DB: mockDB, JWT_SECRET: 'test_secret' });

    // 1. Signup
    const signupReq = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com', password: 'secure123', name: 'New User' })
    });
    const signupRes = await worker.fetch(signupReq, env, makeCtx());
    expect(signupRes.status).toBe(200);
    const signupData = await signupRes.json() as any;
    expect(signupData.token).toBeDefined();
    expect(signupData.user.email).toBe('newuser@example.com');

    // 2. Duplicate signup should fail
    const dupReq = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com', password: 'secure123', name: 'New User' })
    });
    const dupRes = await worker.fetch(dupReq, env, makeCtx());
    expect(dupRes.status).toBe(409);

    // 3. Login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com', password: 'secure123' })
    });
    const loginRes = await worker.fetch(loginReq, env, makeCtx());
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json() as any;
    expect(loginData.token).toBeDefined();
    const token = loginData.token;

    // 4. Bad login
    const badReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com', password: 'wrong' })
    });
    const badRes = await worker.fetch(badReq, env, makeCtx());
    expect(badRes.status).toBe(401);

    // 5. Get profile (/api/auth/me)
    const meReq = new Request('http://localhost/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const meRes = await worker.fetch(meReq, env, makeCtx());
    expect(meRes.status).toBe(200);
    const meData = await meRes.json() as any;
    expect(meData.user.email).toBe('newuser@example.com');

    // 6. Manage API Keys
    const createKeyReq = new Request('http://localhost/api/auth/keys', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My CLI Key' })
    });
    const createKeyRes = await worker.fetch(createKeyReq, env, makeCtx());
    expect(createKeyRes.status).toBe(200);
    const keyData = await createKeyRes.json() as any;
    expect(keyData.apiKey).toBeDefined();
    expect(keyData.apiKey.startsWith('cr_')).toBe(true);

    const listKeyReq = new Request('http://localhost/api/auth/keys', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listKeyRes = await worker.fetch(listKeyReq, env, makeCtx());
    const listData = await listKeyRes.json() as any;
    expect(listData.keys.length).toBe(1);
    
    const keyHash = listData.keys[0].key_hash;
    
    // Try to authenticate with the new API key
    const authWithKeyReq = new Request('http://localhost/api/auth/me', {
      headers: { 'x-api-key': keyData.apiKey }
    });
    const authWithKeyRes = await worker.fetch(authWithKeyReq, env, makeCtx());
    expect(authWithKeyRes.status).toBe(200);

    // Revoke key
    const revokeReq = new Request(`http://localhost/api/auth/keys/${keyHash}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const revokeRes = await worker.fetch(revokeReq, env, makeCtx());
    expect(revokeRes.status).toBe(200);
    
    // Auth with revoked key should fail
    const revokedAuthReq = new Request('http://localhost/api/auth/me', {
      headers: { 'x-api-key': keyData.apiKey }
    });
    const revokedAuthRes = await worker.fetch(revokedAuthReq, env, makeCtx());
    expect(revokedAuthRes.status).toBe(401);
  });

  it('should handle missing fields in signup and login, and db errors', async () => {
    const mockDB = makeAuthMockDB();
    const env = makeEnv({ DB: mockDB, JWT_SECRET: 'test_secret' });

    // Missing fields in signup
    const signupReq = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'only_email@example.com' })
    });
    const signupRes = await worker.fetch(signupReq, env, makeCtx());
    expect(signupRes.status).toBe(400);

    // Missing fields in login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'only_email@example.com' })
    });
    const loginRes = await worker.fetch(loginReq, env, makeCtx());
    expect(loginRes.status).toBe(400);

    // Database error (simulated by deleting users table support in mock temporarily)
    const errDB = {
      prepare: () => ({
        bind: () => ({
          run: async () => { throw new Error('Generic DB Error'); }
        })
      })
    };
    const errEnv = makeEnv({ DB: errDB, JWT_SECRET: 'test_secret' });
    const errSignupReq = new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'error@example.com', password: 'secure', name: 'Err' })
    });
    const errSignupRes = await worker.fetch(errSignupReq, errEnv, makeCtx());
    expect(errSignupRes.status).toBe(500);

    // Fallback Legacy user for /me
    const legacyReq = new Request('http://localhost/api/auth/me', {
      headers: { 'Authorization': `Bearer missingtoken` } // invalid token goes to API key logic
    });
    // With valid env.API_KEY we get userId 'default'. It's not in DB, so it should return legacy fallback.
    const legacyRes = await worker.fetch(new Request('http://localhost/api/auth/me', {
      headers: { 'x-api-key': TEST_API_KEY }
    }), makeEnv({ DB: mockDB }), makeCtx());
    expect(legacyRes.status).toBe(200);
    const legacyData = await legacyRes.json() as any;
    expect(legacyData.user.name).toBe('Legacy User');
    
    // 404 Not Found for auth API
    const notFoundReq = new Request('http://localhost/api/auth/doesnotexist', { 
      method: 'POST',
      headers: { 'x-api-key': TEST_API_KEY }
    });
    const notFoundRes = await worker.fetch(notFoundReq, makeEnv({ DB: mockDB }), makeCtx());
    expect(notFoundRes.status).toBe(404);
  });
});
