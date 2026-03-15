export interface Env {
  // Bindings
  AI: any;
  VECTORIZE: any;
  GIT_PACKS_BUCKET: R2Bucket;
  ROOM_SESSION: DurableObjectNamespace;
  DB: D1Database;
  // Secrets
  API_KEY: string;
}

export { RoomSession } from './roomSession';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requireApiKey(request: Request, env: Env): Response | null {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== env.API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return null;
}

function corsResponse(body: string | null, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...(extraHeaders || {}) },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- CORS Preflight ---
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
      });
    }

    // --- Session API (D1) — requires API key ---
    if (path.startsWith('/api/sessions')) {
      const denied = requireApiKey(request, env);
      if (denied) return denied;
      return handleSessionsAPI(request, env, path, ctx);
    }

    if (path.startsWith('/api/gems')) {
      const denied = requireApiKey(request, env);
      if (denied) return denied;
      return handleGemsAPI(request, env);
    }

    // --- Semantic Search API (Vectorize) — requires API key ---
    if (path.startsWith('/api/search')) {
      const denied = requireApiKey(request, env);
      if (denied) return denied;
      return handleSearchAPI(request, env);
    }

    // --- Git Packfiles API (R2) — requires API key ---
    if (path.startsWith('/api/git/')) {
      const denied = requireApiKey(request, env);
      if (denied) return denied;
      return handleGitAPI(request, env, path);
    }

    // --- WebSocket Rooms (Durable Objects) ---
    if (path.startsWith('/room/')) {
      const parts = path.split('/');
      const sessionId = parts[2];
      if (!sessionId) {
        return corsResponse('Missing Session ID', 400);
      }

      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return corsResponse('Expected Upgrade: websocket', 426);
      }

      const id = env.ROOM_SESSION.idFromName(sessionId);
      const stub = env.ROOM_SESSION.get(id);
      return stub.fetch(request);
    }

    // --- Git Smart HTTP ---
    if (path.startsWith('/git/') && path.endsWith('/info/refs')) {
      return handleGitInfoRefs(request, env);
    }

    if (path.startsWith('/git/') && path.endsWith('/git-receive-pack')) {
      return handleGitReceivePack(request, env);
    }

    // --- Fallback ---
    return corsResponse('Not Found', 404);
  },
};

// ─── Sessions CRUD ───────────────────────────────────────────────

async function handleSessionsAPI(request: Request, env: Env, path: string, ctx?: ExecutionContext): Promise<Response> {
  // Extract session ID from /api/sessions/:id
  const segments = path.replace(/^\/api\/sessions\/?/, '').split('/').filter(Boolean);
  const sessionId = segments[0] || null;

  switch (request.method) {
    case 'GET': {
      if (sessionId) {
        // Load one session
        const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);
        return jsonResponse(mapRow(row));
      } else {
        // List all sessions
        const { results } = await env.DB.prepare(
          'SELECT id, timestamp, preview, custom_name, config, is_archived FROM sessions ORDER BY timestamp DESC LIMIT 200'
        ).all();
        return jsonResponse(results?.map(mapRow) || []);
      }
    }

    case 'PUT': {
      if (!sessionId) return jsonResponse({ error: 'Session ID required' }, 400);
      const body = await request.json() as any;

      await env.DB.prepare(
        `INSERT INTO sessions (id, timestamp, preview, custom_name, config, data, is_archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           timestamp = ?2, preview = ?3, custom_name = ?4, config = ?5, data = ?6, is_archived = ?7`
      ).bind(
        sessionId,
        body.timestamp || Date.now(),
        body.preview || '',
        body.customName || null,
        typeof body.config === 'string' ? body.config : JSON.stringify(body.config || {}),
        typeof body.data === 'string' ? body.data : JSON.stringify(body.data || {}),
        body.isArchived ? 1 : 0
      ).run();

      // Fire-and-forget: generate embeddings for semantic search
      const sessionData = typeof body.data === 'string' ? JSON.parse(body.data) : (body.data || {});
      const embeddingPromise = generateSessionEmbeddings(sessionId, sessionData, env);
      if (ctx) {
        ctx.waitUntil(embeddingPromise);
      }

      return jsonResponse({ id: sessionId, ok: true });
    }

    case 'PATCH': {
      if (!sessionId) return jsonResponse({ error: 'Session ID required' }, 400);
      const body = await request.json() as any;

      const updates: string[] = [];
      const values: any[] = [];

      if (body.customName !== undefined) {
        updates.push('custom_name = ?');
        values.push(body.customName);
      }
      if (body.isArchived !== undefined) {
        updates.push('is_archived = ?');
        values.push(body.isArchived ? 1 : 0);
      }

      if (updates.length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

      values.push(sessionId);
      await env.DB.prepare(
        `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...values).run();

      return jsonResponse({ id: sessionId, ok: true });
    }

    case 'DELETE': {
      if (!sessionId) return jsonResponse({ error: 'Session ID required' }, 400);
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
      return jsonResponse({ id: sessionId, ok: true });
    }

    default:
      return corsResponse('Method Not Allowed', 405);
  }
}

function mapRow(row: any): any {
  return {
    id: row.id,
    timestamp: row.timestamp,
    preview: row.preview,
    customName: row.custom_name,
    config: row.config,
    data: row.data,
    isArchived: !!row.is_archived,
    isCloud: true,
  };
}

// ─── Semantic Search (Vectorize) ─────────────────────────────────

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

/**
 * Extracts searchable text from a session's message data,
 * generates an embedding via Workers AI, and upserts it into Vectorize.
 */
export async function generateSessionEmbeddings(
  sessionId: string,
  data: any,
  env: Env,
): Promise<void> {
  try {
    if (!env.AI || !env.VECTORIZE) return;

    const texts: string[] = [];
    const messages = data?.messages || [];
    for (const msg of messages) {
      if (msg.content) texts.push(msg.content.substring(0, 500));
      if (msg.internalState?.semanticNodes) {
        const labels = msg.internalState.semanticNodes
          .map((n: any) => n.label || n.id)
          .filter(Boolean);
        if (labels.length) texts.push(labels.join(', '));
      }
    }
    if (texts.length === 0) return;

    // Truncate combined text to stay within model context window
    const combined = texts.join('\n').substring(0, 2000);

    const embeddingResult = await env.AI.run(EMBEDDING_MODEL, {
      text: [combined],
    });

    const vector = embeddingResult?.data?.[0];
    if (!vector || !vector.length) return;

    await env.VECTORIZE.upsert([{
      id: sessionId,
      values: vector,
      metadata: { sessionId },
    }]);
  } catch (err) {
    console.error(`[Vectorize] Failed to embed session ${sessionId}:`, err);
  }
}

async function handleSearchAPI(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return corsResponse('Method Not Allowed', 405);
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  if (!query || !query.trim()) {
    return jsonResponse({ error: 'Missing query parameter "q"' }, 400);
  }

  if (!env.AI || !env.VECTORIZE) {
    return jsonResponse({ error: 'Search is not configured' }, 503);
  }

  // Embed the query
  const embeddingResult = await env.AI.run(EMBEDDING_MODEL, {
    text: [query],
  });
  const queryVector = embeddingResult?.data?.[0];
  if (!queryVector?.length) {
    return jsonResponse({ results: [] });
  }

  // Query Vectorize for nearest neighbors
  const topK = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
  const matches = await env.VECTORIZE.query(queryVector, { topK });

  if (!matches?.matches?.length) {
    return jsonResponse({ results: [] });
  }

  // Hydrate results with D1 session metadata
  const ids: string[] = matches.matches.map((m: any) => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const { results: rows } = await env.DB.prepare(
    `SELECT id, timestamp, preview, custom_name FROM sessions WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  const rowMap = new Map((rows || []).map((r: any) => [r.id, r]));
  const results = matches.matches
    .filter((m: any) => rowMap.has(m.id))
    .map((m: any) => {
      const row = rowMap.get(m.id)!;
      return {
        sessionId: row.id,
        preview: row.preview,
        customName: row.custom_name,
        score: m.score,
        timestamp: row.timestamp,
      };
    });

  return jsonResponse({ results });
}

// ─── Gems Config ─────────────────────────────────────────────────

async function handleGemsAPI(request: Request, env: Env): Promise<Response> {
  switch (request.method) {
    case 'GET': {
      const row = await env.DB.prepare('SELECT config FROM gems_config WHERE id = ?').bind('default').first();
      return jsonResponse(row?.config ? JSON.parse(row.config as string) : null);
    }
    case 'PUT': {
      const body = await request.json();
      await env.DB.prepare(
        `INSERT INTO gems_config (id, config) VALUES ('default', ?1)
         ON CONFLICT(id) DO UPDATE SET config = ?1`
      ).bind(JSON.stringify(body)).run();
      return jsonResponse({ ok: true });
    }
    default:
      return corsResponse('Method Not Allowed', 405);
  }
}

// ─── Git Packfiles API (R2) ──────────────────────────────────────

async function handleGitAPI(request: Request, env: Env, path: string): Promise<Response> {
  // /api/git/:sessionId/packs — list packfiles
  // /api/git/:sessionId/packs/:filename — download a packfile
  const match = path.match(/^\/api\/git\/([^/]+)\/packs(?:\/(.+))?$/);
  if (!match) return jsonResponse({ error: 'Invalid git API path' }, 400);

  const sessionId = match[1];
  const filename = match[2];

  if (request.method !== 'GET') {
    return corsResponse('Method Not Allowed', 405);
  }

  if (filename) {
    // Download a specific packfile
    const object = await env.GIT_PACKS_BUCKET.get(filename);
    if (!object) return jsonResponse({ error: 'Not found' }, 404);

    return new Response(object.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'ETag': object.httpEtag,
      },
    });
  }

  // List packfiles for this session
  const prefix = `pack-${sessionId}-`;
  const listed = await env.GIT_PACKS_BUCKET.list({ prefix });
  const packs = listed.objects.map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
  }));

  return jsonResponse({ sessionId, packs });
}

// ─── Git Smart HTTP ──────────────────────────────────────────────

async function handleGitInfoRefs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const service = url.searchParams.get('service');

  if (service !== 'git-receive-pack') {
    return corsResponse('Only git-receive-pack is supported', 400);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return corsResponse('Unauthorized', 401);
  }

  const headers = new Headers({
    'Content-Type': `application/x-${service}-advertisement`,
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  });

  const str1 = `# service=${service}\n`;
  const len1 = (str1.length + 4).toString(16).padStart(4, '0');
  const str2 = '0000';
  const str3 = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v1\n`;
  const len3 = (str3.length + 4).toString(16).padStart(4, '0');

  const body = `${len1}${str1}${str2}${len3}${str3}0000`;
  return new Response(body, { status: 200, headers });
}

async function handleGitReceivePack(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return corsResponse('Unauthorized', 401);
  }

  const packfileBuffer = await request.arrayBuffer();
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[2];

  console.log(`Received packfile of ${packfileBuffer.byteLength} bytes for session ${sessionId}`);

  try {
    if (env.GIT_PACKS_BUCKET) {
      const fileName = `pack-${sessionId}-${Date.now()}.pack`;
      await env.GIT_PACKS_BUCKET.put(fileName, packfileBuffer);
      console.log(`Successfully persisted packfile to R2 for ${sessionId}`);
    } else {
      console.warn('R2 bucket not configured, skipping packfile persistence');
    }
  } catch (err: any) {
    console.warn(`Failed to push to R2 Bucket: ${err.message}`);
  }

  const headers = new Headers({
    'Content-Type': 'application/x-git-receive-pack-result',
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  });

  const report1 = "unpack ok\n";
  const len1 = (report1.length + 4).toString(16).padStart(4, '0');
  const report2 = "ok refs/heads/main\n";
  const len2 = (report2.length + 4).toString(16).padStart(4, '0');

  const body = `${len1}${report1}${len2}${report2}0000`;
  return new Response(body, { status: 200, headers });
}
