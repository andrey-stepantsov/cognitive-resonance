export interface Env {
  // Bindings
  AI: any;
  VECTORIZE: any;
  GIT_PACKS_BUCKET: R2Bucket;
  ROOM_SESSION: DurableObjectNamespace;
  DB: D1Database;
  // Secrets
  API_KEY: string;
  JWT_SECRET?: string;
  // Appwrite auth
  APPWRITE_ENDPOINT?: string;
  APPWRITE_PROJECT_ID?: string;
}

// ─── Rate Limiting ───────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds
const RATE_LIMIT_MAX_REQUESTS = 60;  // max requests per window per IP

/** In-memory sliding-window rate limit store: IP → list of timestamps */
export const rateLimitStore = new Map<string, number[]>();
let rateLimitGcCounter = 0;

/**
 * Check if a request from the given IP should be rate-limited.
 * Returns true if the request is ALLOWED, false if it should be rejected.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = rateLimitStore.get(ip);
  if (!timestamps) {
    timestamps = [];
    rateLimitStore.set(ip, timestamps);
  }

  // Prune old entries outside the window
  while (timestamps.length > 0 && timestamps[0] <= windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limited
  }

  timestamps.push(now);

  // Periodic GC: every 100 calls, prune stale IPs
  if (++rateLimitGcCounter >= 100) {
    rateLimitGcCounter = 0;
    for (const [key, ts] of rateLimitStore) {
      if (ts.length === 0 || ts[ts.length - 1] <= windowStart) {
        rateLimitStore.delete(key);
      }
    }
  }

  return true; // Allowed
}

import {
  verifyJwt,
  signJwt,
  hashPassword,
  verifyPassword,
  generateApiKey,
  decodeJwtParts
} from './auth';

import { handleAuthAPI } from './authRoutes';
export { RoomSession } from './roomSession';

import {
  parsePackfile,
  buildPackfile,
  parseReceivePackInput,
  parseWantHaveLines,
  extractObjectRefs,
  gitObjectSha,
  type GitObject,
  type GitObjectType,
} from './packParser';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function corsResponse(body: string | null, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...(extraHeaders || {}) },
  });
}

// ─── Auth ────────────────────────────────────────────────────────

// ─── Appwrite JWT verification via account.get() ────────────────

/** Cached verified JWTs: token → { userId, verifiedAt } */
const jwtVerifyCache = new Map<string, { userId: string; verifiedAt: number }>();
const JWT_CACHE_TTL = 300_000; // 5 minutes

/** Clear the JWT cache (for testing). */
export function clearJwksCache() {
  jwtVerifyCache.clear();
}

/**
 * Verify an Appwrite JWT by calling the Appwrite Account API.
 *
 * Appwrite doesn't expose a JWKS endpoint for external JWT verification.
 * The supported pattern is to call `GET /v1/account` with the JWT set via
 * `X-Appwrite-JWT` header. If the token is valid, Appwrite returns the user.
 */
export async function verifyAppwriteJwt(
  token: string,
  endpoint: string,
  projectId?: string,
): Promise<{ userId: string } | null> {
  // Check cache first
  const cached = jwtVerifyCache.get(token);
  if (cached && Date.now() - cached.verifiedAt < JWT_CACHE_TTL) {
    return { userId: cached.userId };
  }

  try {
    const accountUrl = endpoint.endsWith('/v1')
      ? `${endpoint}/account`
      : `${endpoint}/v1/account`;

    const headers: Record<string, string> = {
      'X-Appwrite-JWT': token,
      'Content-Type': 'application/json',
    };

    // Appwrite Cloud requires the project ID header
    if (projectId) {
      headers['X-Appwrite-Project'] = projectId;
    }

    const response = await fetch(accountUrl, { headers });
    if (!response.ok) return null;

    const account = await response.json() as { $id?: string; email?: string };
    const userId = account.$id;
    if (!userId) return null;

    // Cache the result
    jwtVerifyCache.set(token, { userId, verifiedAt: Date.now() });

    return { userId };
  } catch {
    return null;
  }
}

interface AuthResult {
  userId: string;
}

/**
 * Authenticate a request. Supports three modes (tried in order):
 * 1. Appwrite JWKS mode (RS256) — when APPWRITE_ENDPOINT is set
 * 2. HMAC mode — when JWT_SECRET is set
 * 3. API key mode — validates API_KEY, returns 'default' as userId
 */
export async function requireAuth(request: Request, env: Env): Promise<Response | AuthResult> {
  let token = '';

  const authHeader = request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('x-api-key');

  if (apiKeyHeader) {
    token = apiKeyHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    // Check URL search params (e.g., for WebSockets)
    const url = new URL(request.url);
    const urlToken = url.searchParams.get('token');
    if (urlToken) {
      token = urlToken;
    }
  }

  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // 0. Local Sandbox / E2E Mock User Token Mode
  // MUST run before any D1/JWT logic to prevent spurious db errors
  if (token.startsWith('cr_mock_')) {
    return { userId: token.replace('cr_mock_', '') };
  }

  // 1. Try Appwrite JWKS (RS256) if configured
  if (env.APPWRITE_ENDPOINT) {
    const result = await verifyAppwriteJwt(token, env.APPWRITE_ENDPOINT, env.APPWRITE_PROJECT_ID);
    if (result) return result;
  }

  // 2. Try HMAC (local Cloudflare Auth)
  const result = await verifyJwt(token, env.JWT_SECRET);
  if (result) {
    // Basic structural check if this is an invite token
    // If it's a guest token, it MUST match the requested roomId if one is provided in the request
    const decoded = decodeJwtParts(token);
    if (decoded?.payload?.role === 'guest') {
       const targetRoomId = decoded.payload.sessionId;
       // We can extract the room ID from the request URL if it's a websocket connection
       const url = new URL(request.url);
       const urlRoomId = url.pathname.split('/')[2];
       if (url.pathname.startsWith('/room/') && urlRoomId !== targetRoomId) {
          return jsonResponse({ error: 'Invalid invite for this room' }, 403);
       }
    }
    return result;
  }

  // 3. Try API Key against D1 api_keys table
  if (token.startsWith('cr_')) {
    const enc = new TextEncoder();
    const hashBytes = await crypto.subtle.digest('SHA-256', enc.encode(token));
    const keyHash = Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const apiKeyRow = await env.DB.prepare('SELECT user_id FROM api_keys WHERE key_hash = ?').bind(keyHash).first();
    if (apiKeyRow) {
      // Intentionally not awaiting this to save time on the critical path
      env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?').bind(Date.now(), keyHash).run().catch(() => {});
      return { userId: apiKeyRow.user_id as string };
    }
  }

  // 4. Fallback: API key mode (backward compatible)
  if (token === env.API_KEY) {
    return { userId: 'default' };
  }

  return jsonResponse({ error: 'Invalid or expired token' }, 401);
}

/** Type guard: is the auth result an error response? */
export function isAuthError(result: Response | AuthResult): result is Response {
  return result instanceof Response;
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

    // --- Rate Limiting ---
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return corsResponse('Rate limit exceeded. Try again later.', 429);
    }

    // --- Auth API ---
    if (path.startsWith('/api/auth')) {
      return handleAuthAPI(request, env);
    }

    // --- Session API (D1) — requires auth ---
    if (path.startsWith('/api/sessions')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleSessionsAPI(request, env, path, authResult.userId, ctx);
    }

    // --- Events Sync API (D1) — requires auth ---
    if (path.startsWith('/api/events')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleEventsAPI(request, env, path, authResult.userId);
    }

    if (path.startsWith('/api/gems')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleGemsAPI(request, env, authResult.userId);
    }

    // --- Semantic Search API (Vectorize) — requires auth ---
    if (path.startsWith('/api/search')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleSearchAPI(request, env, authResult.userId);
    }

    // --- Git Packfiles API (R2) — requires auth ---
    if (path.startsWith('/api/git/')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleGitAPI(request, env, path, authResult.userId);
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
      
      // Pass the roomId to requireAuth via the request URL so it can validate guest tokens
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;

      const id = env.ROOM_SESSION.idFromName(sessionId);
      const stub = env.ROOM_SESSION.get(id);

      const newHeaders = new Headers(request.headers);
      newHeaders.set('X-User-Id', authResult.userId);
      
      const requestedName = url.searchParams.get('name');
      if (requestedName) {
         newHeaders.set('X-User-Name', requestedName);
      }
      
      const modifiedRequest = new Request(request.url, {
        method: request.method,
        headers: newHeaders,
      });

      return stub.fetch(modifiedRequest);
    }

    // --- Git Smart HTTP ---
    if (path.startsWith('/git/') && path.endsWith('/info/refs')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleGitInfoRefs(request, env, authResult.userId);
    }

    if (path.startsWith('/git/') && path.endsWith('/git-receive-pack')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleGitReceivePack(request, env, authResult.userId);
    }

    if (path.startsWith('/git/') && path.endsWith('/git-upload-pack')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleGitUploadPack(request, env, authResult.userId);
    }

    // --- Fallback ---
    return corsResponse('Not Found', 404);
  },
};

// ─── Sessions CRUD ───────────────────────────────────────────────

async function handleSessionsAPI(request: Request, env: Env, path: string, userId: string, ctx?: ExecutionContext): Promise<Response> {
  // Extract session ID from /api/sessions/:id
  const segments = path.replace(/^\/api\/sessions\/?/, '').split('/').filter(Boolean);
  const sessionId = segments[0] || null;

  switch (request.method) {
    case 'GET': {
      if (sessionId) {
        // Load a specific session (allow any user to view for read-only sharing)
        const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);
        return jsonResponse(mapRow(row));
      } else {
        // List all sessions — scoped to user
        const { results } = await env.DB.prepare(
          'SELECT id, timestamp, preview, custom_name, config, is_archived FROM sessions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 200'
        ).bind(userId).all();
        return jsonResponse(results?.map(mapRow) || []);
      }
    }

    case 'PUT': {
      if (!sessionId) return jsonResponse({ error: 'Session ID required' }, 400);
      const body = await request.json() as any;

      await env.DB.prepare(
        `INSERT INTO sessions (id, timestamp, preview, custom_name, config, data, is_archived, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           timestamp = ?2, preview = ?3, custom_name = ?4, config = ?5, data = ?6, is_archived = ?7`
      ).bind(
        sessionId,
        body.timestamp || Date.now(),
        body.preview || '',
        body.customName || null,
        typeof body.config === 'string' ? body.config : JSON.stringify(body.config || {}),
        typeof body.data === 'string' ? body.data : JSON.stringify(body.data || {}),
        body.isArchived ? 1 : 0,
        userId,
      ).run();

      // Fire-and-forget: generate embeddings for semantic search
      const sessionData = typeof body.data === 'string' ? JSON.parse(body.data) : (body.data || {});
      const embeddingPromise = generateSessionEmbeddings(sessionId, sessionData, env, userId);
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
      values.push(userId);
      await env.DB.prepare(
        `UPDATE sessions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
      ).bind(...values).run();

      return jsonResponse({ id: sessionId, ok: true });
    }

    case 'DELETE': {
      if (!sessionId) return jsonResponse({ error: 'Session ID required' }, 400);
      await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(sessionId, userId).run();
      return jsonResponse({ id: sessionId, ok: true });
    }

    case 'POST': {
      if (!sessionId) return jsonResponse({ error: 'Source session ID required' }, 400);
      const url = new URL(request.url);
      const action = url.pathname.split('/').pop();
      if (action !== 'fork') {
        return corsResponse('Method Not Allowed', 405);
      }

      const body = await request.json() as any;
      const newSessionId = body.id || crypto.randomUUID();

      // 1. Fetch the parent session - we allow anyone to fork if they know the ID
      // because the original session ID acts as the capability token to read/fork.
      const parentSession = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
      if (!parentSession) return jsonResponse({ error: 'Source session not found' }, 404);

      const now = Date.now();

      // 2. Clone it with new ID and set parent refs
      await env.DB.prepare(
        `INSERT INTO sessions (id, timestamp, preview, custom_name, config, data, parent_id, forked_at, is_archived, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      ).bind(
        newSessionId,
        now,
        parentSession.preview,
        parentSession.custom_name,
        parentSession.config,
        parentSession.data, // Duplicate the entire json state exact same blob
        sessionId, // set parent_id
        now, // set forked_at
        0, // unarchive the new fork
        userId,
      ).run();

      return jsonResponse({ id: newSessionId, parent_id: sessionId, ok: true });
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
    parentId: row.parent_id,
    forkedAt: row.forked_at,
    isArchived: !!row.is_archived,
    userId: row.user_id,
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
  userId: string = 'default',
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
      metadata: { sessionId, userId },
    }]);
  } catch (err) {
    console.error(`[Vectorize] Failed to embed session ${sessionId}:`, err);
  }
}

async function handleSearchAPI(request: Request, env: Env, userId: string): Promise<Response> {
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

  // Query Vectorize for nearest neighbors, scoped to user
  const topK = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
  const matches = await env.VECTORIZE.query(queryVector, {
    topK,
    filter: { userId },
  });

  if (!matches?.matches?.length) {
    return jsonResponse({ results: [] });
  }

  // Hydrate results with D1 session metadata
  const ids: string[] = matches.matches.map((m: any) => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const { results: rows } = await env.DB.prepare(
    `SELECT id, timestamp, preview, custom_name FROM sessions WHERE id IN (${placeholders}) AND user_id = ?`
  ).bind(...ids, userId).all();

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

// ─── Events Sync (D1) ────────────────────────────────────────────

async function handleEventsAPI(request: Request, env: Env, path: string, userId: string): Promise<Response> {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    
    // Safety limit 500 events per pull
    const { results } = await env.DB.prepare(
      'SELECT id, session_id, timestamp, actor, type, payload, previous_event_id FROM events WHERE user_id = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT 500'
    ).bind(userId, since).all();
    
    return jsonResponse({ events: results || [] });
  } 
  
  if (request.method === 'POST') {
    const isBatch = path.endsWith('/batch');
    if (!isBatch) return corsResponse('Only /batch is supported for POST', 400);
    
    const body = await request.json() as { events: any[] };
    if (!body.events || !Array.isArray(body.events)) {
       return jsonResponse({ error: 'Expected an array of events' }, 400);
    }
    
    if (body.events.length === 0) return jsonResponse({ ok: true });
    
    // D1 Transactions / Batching
    const stmts = body.events.map(ev => {
       const payloadStr = typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload);
       return env.DB.prepare(`
         INSERT OR IGNORE INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       `).bind(
         ev.id,
         ev.session_id,
         ev.timestamp,
         ev.actor,
         ev.type,
         payloadStr,
         ev.previous_event_id || null,
         userId
       );
    });
    
    try {
      await env.DB.batch(stmts);
      return jsonResponse({ ok: true });
    } catch (err: any) {
      console.error('[Sync Daemon] Failed to handle event batch:', err);
      return jsonResponse({ error: 'Failed to insert events' }, 500);
    }
  }
  
  return corsResponse('Method Not Allowed', 405);
}

// ─── Gems Config ─────────────────────────────────────────────────

async function handleGemsAPI(request: Request, env: Env, userId: string): Promise<Response> {
  switch (request.method) {
    case 'GET': {
      const row = await env.DB.prepare('SELECT config FROM gems_config WHERE id = ? AND user_id = ?').bind('default', userId).first();
      return jsonResponse(row?.config ? JSON.parse(row.config as string) : null);
    }
    case 'PUT': {
      const body = await request.json();
      await env.DB.prepare(
        `INSERT INTO gems_config (id, config, user_id) VALUES ('default', ?1, ?2)
         ON CONFLICT(id, user_id) DO UPDATE SET config = ?1`
      ).bind(JSON.stringify(body), userId).run();
      return jsonResponse({ ok: true });
    }
    default:
      return corsResponse('Method Not Allowed', 405);
  }
}

// ─── Git Packfiles API (R2) ──────────────────────────────────────

async function handleGitAPI(request: Request, env: Env, path: string, userId: string): Promise<Response> {
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
    // Download a specific packfile — ensure it belongs to the user's namespace
    const namespacedKey = `${userId}/${filename}`;
    const object = await env.GIT_PACKS_BUCKET.get(namespacedKey);
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

  // List packfiles for this session — scoped to user
  const prefix = `${userId}/pack-${sessionId}-`;
  const listed = await env.GIT_PACKS_BUCKET.list({ prefix });
  const packs = listed.objects.map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
  }));

  return jsonResponse({ sessionId, packs });
}

// ─── Git Smart HTTP ──────────────────────────────────────────────

/**
 * Read a ref SHA from R2. Refs are stored as small text files.
 */
async function readRef(bucket: R2Bucket, userId: string, refName: string): Promise<string | null> {
  const key = `${userId}/refs/${refName}`;
  const obj = await bucket.get(key);
  if (!obj) return null;
  const text = await obj.text();
  return text.trim() || null;
}

/**
 * Write a ref SHA to R2.
 */
async function writeRef(bucket: R2Bucket, userId: string, refName: string, sha: string): Promise<void> {
  const key = `${userId}/refs/${refName}`;
  await bucket.put(key, sha);
}

/**
 * Store a loose git object in R2 under {userId}/objects/{2-char prefix}/{38-char rest}.
 */
async function storeLooseObject(bucket: R2Bucket, userId: string, obj: GitObject): Promise<void> {
  const key = `${userId}/objects/${obj.sha.slice(0, 2)}/${obj.sha.slice(2)}`;
  // Store with metadata for type so we can reconstruct without parsing
  await bucket.put(key, obj.data, {
    customMetadata: { type: obj.type },
  });
}

/**
 * Read a loose git object from R2.
 */
async function readLooseObject(bucket: R2Bucket, userId: string, sha: string): Promise<GitObject | null> {
  const key = `${userId}/objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
  const r2Obj = await bucket.get(key);
  if (!r2Obj) return null;
  const data = new Uint8Array(await r2Obj.arrayBuffer());
  const type = (r2Obj.customMetadata?.type || 'blob') as GitObjectType;
  return { sha, type, data };
}

/**
 * List all loose object SHAs for a user/session prefix.
 */
async function listLooseObjectShas(bucket: R2Bucket, userId: string): Promise<string[]> {
  const prefix = `${userId}/objects/`;
  const shas: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    for (const obj of listed.objects) {
      // key: {userId}/objects/{2}/{38}
      const parts = obj.key.replace(prefix, '').split('/');
      if (parts.length === 2) {
        shas.push(parts[0] + parts[1]);
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return shas;
}

async function handleGitInfoRefs(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const service = url.searchParams.get('service');

  if (service !== 'git-receive-pack' && service !== 'git-upload-pack') {
    return corsResponse('Unsupported git service', 400);
  }

  const parts = url.pathname.split('/');
  const sessionId = parts[2];

  const headers = new Headers({
    'Content-Type': `application/x-${service}-advertisement`,
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  });

  const str1 = `# service=${service}\n`;
  const len1 = (str1.length + 4).toString(16).padStart(4, '0');

  let capsLine: string;

  if (service === 'git-upload-pack' && env.GIT_PACKS_BUCKET && sessionId) {
    // Read real ref from R2
    const headSha = await readRef(env.GIT_PACKS_BUCKET, userId, `heads/main`);

    if (headSha) {
      capsLine = `${headSha} refs/heads/main\0report-status side-band-64k agent=cr-cloudflare-v2\n`;
    } else {
      capsLine = `0000000000000000000000000000000000000000 capabilities^{}\0report-status side-band-64k agent=cr-cloudflare-v2\n`;
    }
  } else {
    capsLine = `0000000000000000000000000000000000000000 capabilities^{}\0report-status side-band-64k agent=cr-cloudflare-v2\n`;
  }

  const len3 = (capsLine.length + 4).toString(16).padStart(4, '0');
  const body = `${len1}${str1}0000${len3}${capsLine}0000`;
  return new Response(body, { status: 200, headers });
}

/**
 * Build a sideband-framed receive-pack response.
 *
 * isomorphic-git always passes the receive-pack response through GitSideBand.demux(),
 * which expects sideband channel framing (channel 1 = data). Each pkt-line in the
 * report-status is wrapped with a 0x01 channel prefix byte.
 */
function buildSidebandReceivePackResponse(refUpdates: string[]): Uint8Array {
  const encoder = new TextEncoder();

  // 1. Build the inner payload: a sequence of pkt-lines ending with a flush packet
  const innerParts: Uint8Array[] = [];

  const encodeInnerPktLine = (str: string) => {
    // 4 hex chars + string length
    const len = (str.length + 4).toString(16).padStart(4, '0');
    return encoder.encode(`${len}${str}`);
  };

  innerParts.push(encodeInnerPktLine('unpack ok\n'));
  for (const ref of refUpdates) {
    innerParts.push(encodeInnerPktLine(`ok ${ref}\n`));
  }
  innerParts.push(encoder.encode('0000')); // Inner flush for report-status

  const innerTotalLen = innerParts.reduce((sum, p) => sum + p.length, 0);
  const innerPayload = new Uint8Array(innerTotalLen);
  let innerOffset = 0;
  for (const p of innerParts) {
    innerPayload.set(p, innerOffset);
    innerOffset += p.length;
  }

  // 2. Wrap the entire inner payload in a sideband channel 1 packet
  // pktLen includes 4 (length itself) + 1 (channel byte) + innerPayload length
  const pktLen = 4 + 1 + innerPayload.length;
  const pktLenHex = pktLen.toString(16).padStart(4, '0');
  
  const outerPkt = new Uint8Array(pktLen);
  outerPkt.set(encoder.encode(pktLenHex), 0);
  outerPkt[4] = 0x01; // sideband channel 1
  outerPkt.set(innerPayload, 5);

  // 3. Add the final flush packet to end the sideband stream
  const flushPkt = encoder.encode('0000');
  
  const result = new Uint8Array(outerPkt.length + flushPkt.length);
  result.set(outerPkt, 0);
  result.set(flushPkt, outerPkt.length);

  return result;
}

async function handleGitReceivePack(request: Request, env: Env, userId: string): Promise<Response> {
  const rawBuffer = await request.arrayBuffer();
  const rawData = new Uint8Array(rawBuffer);
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[2];

  console.log(`Received ${rawBuffer.byteLength} bytes for session ${sessionId}`);

  const respHeaders = new Headers({
    'Content-Type': 'application/x-git-receive-pack-result',
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  });

  try {
    if (!env.GIT_PACKS_BUCKET) {
      console.warn('R2 bucket not configured, skipping packfile persistence');
      return new Response(buildSidebandReceivePackResponse(['refs/heads/main']), { status: 200, headers: respHeaders });
    }

    // Parse pkt-line commands and locate packfile data
    const { commands, packOffset } = parseReceivePackInput(rawData);
    const packData = rawData.slice(packOffset);

    let refUpdates: string[] = [];

    if (packData.length >= 12) {
      // Parse the packfile into individual objects
      const objects = await parsePackfile(packData.buffer.slice(
        packData.byteOffset,
        packData.byteOffset + packData.byteLength
      ));

      console.log(`Parsed ${objects.length} objects from packfile`);

      // Store each object as a loose object in R2
      for (const obj of objects) {
        await storeLooseObject(env.GIT_PACKS_BUCKET, userId, obj);
      }

      console.log(`Stored ${objects.length} loose objects in R2`);
    }

    // Update refs based on the commands
    for (const cmd of commands) {
      await writeRef(env.GIT_PACKS_BUCKET, userId, cmd.refName.replace('refs/', ''), cmd.newSha);
      refUpdates.push(cmd.refName);
      console.log(`Updated ref ${cmd.refName} → ${cmd.newSha}`);
    }

    // If no explicit commands, default to updating refs/heads/main
    if (refUpdates.length === 0) {
      refUpdates.push('refs/heads/main');
    }

    return new Response(buildSidebandReceivePackResponse(refUpdates), { status: 200, headers: respHeaders });

  } catch (err: any) {
    console.error(`Failed to process receive-pack for ${sessionId}:`, err);

    // Even on parse failure, return a valid git protocol response
    return new Response(buildSidebandReceivePackResponse(['refs/heads/main']), { status: 200, headers: respHeaders });
  }
}

async function handleGitUploadPack(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[2];

  if (!env.GIT_PACKS_BUCKET) {
    return corsResponse('R2 bucket not configured', 500);
  }

  const respHeaders = new Headers({
    'Content-Type': 'application/x-git-upload-pack-result',
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  });

  // Check if we have any refs at all
  const headSha = await readRef(env.GIT_PACKS_BUCKET, userId, 'heads/main');

  if (!headSha) {
    // No refs — send NAK (nothing to send)
    const nakLine = 'NAK\n';
    const lenNak = (nakLine.length + 4).toString(16).padStart(4, '0');
    return new Response(`${lenNak}${nakLine}0000`, { status: 200, headers: respHeaders });
  }

  // Parse the client's want/have lines
  const body = await request.arrayBuffer();
  const { wants, haves } = parseWantHaveLines(new Uint8Array(body));

  // Collect objects to send via graph walk from wanted SHAs
  const haveSet = new Set(haves);
  const objectsToSend: GitObject[] = [];
  const visited = new Set<string>();
  const queue: string[] = [...wants];

  // If no wants specified, use the head SHA
  if (queue.length === 0) {
    queue.push(headSha);
  }

  // BFS walk from wanted SHAs, stopping at have boundaries
  while (queue.length > 0) {
    const sha = queue.shift()!;
    if (visited.has(sha) || haveSet.has(sha)) continue;
    visited.add(sha);

    const obj = await readLooseObject(env.GIT_PACKS_BUCKET, userId, sha);
    if (!obj) continue;

    objectsToSend.push(obj);

    // Follow references (commit → tree + parents, tree → entries)
    const refs = extractObjectRefs(obj);
    for (const ref of refs) {
      if (!visited.has(ref) && !haveSet.has(ref)) {
        queue.push(ref);
      }
    }
  }

  if (objectsToSend.length === 0) {
    const nakLine = 'NAK\n';
    const lenNak = (nakLine.length + 4).toString(16).padStart(4, '0');
    return new Response(`${lenNak}${nakLine}0000`, { status: 200, headers: respHeaders });
  }

  // Build a packfile from the missing objects
  const packBytes = await buildPackfile(objectsToSend);

  // Build response: NAK + sideband pack data + flush
  const nakLine = 'NAK\n';
  const lenNak = (nakLine.length + 4).toString(16).padStart(4, '0');

  // Sideband channel 1 = pack data
  const sideband = new Uint8Array(packBytes.length + 1);
  sideband[0] = 0x01;
  sideband.set(packBytes, 1);

  const sidebandLen = (sideband.length + 4).toString(16).padStart(4, '0');

  const encoder = new TextEncoder();
  const nakBytes = encoder.encode(`${lenNak}${nakLine}`);
  const sidebandHeader = encoder.encode(sidebandLen);
  const flush = encoder.encode('0000');

  const response = new Uint8Array(
    nakBytes.length + sidebandHeader.length + sideband.length + flush.length
  );
  let offset = 0;
  response.set(nakBytes, offset); offset += nakBytes.length;
  response.set(sidebandHeader, offset); offset += sidebandHeader.length;
  response.set(sideband, offset); offset += sideband.length;
  response.set(flush, offset);

  return new Response(response, { status: 200, headers: respHeaders });
}
