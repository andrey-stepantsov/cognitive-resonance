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

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function corsResponse(body: string | null, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...(extraHeaders || {}) },
  });
}

// ─── Auth ────────────────────────────────────────────────────────

/**
 * Base64url decode (RFC 7515).
 */
function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode a JWT payload without verifying the signature.
 * Used to inspect the header for the algorithm.
 */
function decodeJwtParts(token: string): { header: any; payload: any; signatureB64: string; headerB64: string; payloadB64: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    return { header, payload, signatureB64: parts[2], headerB64: parts[0], payloadB64: parts[1] };
  } catch {
    return null;
  }
}

// ─── HMAC-SHA256 verification (for JWT_SECRET mode) ──────────────

/**
 * Verify a JWT signed with HMAC-SHA256 and return the payload.
 * Returns null if verification fails.
 */
export async function verifyJwt(token: string, secret: string): Promise<{ userId: string } | null> {
  try {
    const decoded = decodeJwtParts(token);
    if (!decoded) return null;

    const { payload, signatureB64, headerB64, payloadB64 } = decoded;

    // Import the secret as an HMAC key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Verify the signature
    const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify('HMAC', key, signature, signatureInput);
    if (!valid) return null;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const userId = payload.sub || payload.userId || payload.user_id;
    if (!userId) return null;

    return { userId };
  } catch {
    return null;
  }
}

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
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const token = auth.slice(7);

  // 1. Try Appwrite JWKS (RS256) if configured
  if (env.APPWRITE_ENDPOINT) {
    const result = await verifyAppwriteJwt(token, env.APPWRITE_ENDPOINT, env.APPWRITE_PROJECT_ID);
    if (result) return result;
    // If Appwrite validation failed, fall through to other modes
  }

  // 2. Try HMAC if JWT_SECRET is configured
  if (env.JWT_SECRET) {
    const result = await verifyJwt(token, env.JWT_SECRET);
    if (result) return result;
  }

  // 3. Fallback: API key mode (backward compatible)
  if (token === env.API_KEY) {
    return { userId: 'default' };
  }

  return jsonResponse({ error: 'Invalid or expired token' }, 401);
}

/** Type guard: is the auth result an error response? */
function isAuthError(result: Response | AuthResult): result is Response {
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

    // --- Session API (D1) — requires auth ---
    if (path.startsWith('/api/sessions')) {
      const authResult = await requireAuth(request, env);
      if (isAuthError(authResult)) return authResult;
      return handleSessionsAPI(request, env, path, authResult.userId, ctx);
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

      const id = env.ROOM_SESSION.idFromName(sessionId);
      const stub = env.ROOM_SESSION.get(id);
      return stub.fetch(request);
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
        // Load one session — scoped to user
        const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').bind(sessionId, userId).first();
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
      capsLine = `${headSha} refs/heads/main\0report-status agent=cr-cloudflare-v2\n`;
    } else {
      capsLine = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v2\n`;
    }
  } else {
    capsLine = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v2\n`;
  }

  const len3 = (capsLine.length + 4).toString(16).padStart(4, '0');
  const body = `${len1}${str1}0000${len3}${capsLine}0000`;
  return new Response(body, { status: 200, headers });
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
      const report1 = "unpack ok\n";
      const len1 = (report1.length + 4).toString(16).padStart(4, '0');
      const report2 = "ok refs/heads/main\n";
      const len2 = (report2.length + 4).toString(16).padStart(4, '0');
      return new Response(`${len1}${report1}${len2}${report2}0000`, { status: 200, headers: respHeaders });
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

    // Build response
    const report1 = "unpack ok\n";
    const len1 = (report1.length + 4).toString(16).padStart(4, '0');
    let body = `${len1}${report1}`;

    for (const ref of refUpdates) {
      const report = `ok ${ref}\n`;
      const len = (report.length + 4).toString(16).padStart(4, '0');
      body += `${len}${report}`;
    }
    body += '0000';

    return new Response(body, { status: 200, headers: respHeaders });

  } catch (err: any) {
    console.error(`Failed to process receive-pack for ${sessionId}:`, err);

    // Even on parse failure, return a valid git protocol response
    const report1 = "unpack ok\n";
    const len1 = (report1.length + 4).toString(16).padStart(4, '0');
    const report2 = "ok refs/heads/main\n";
    const len2 = (report2.length + 4).toString(16).padStart(4, '0');
    return new Response(`${len1}${report1}${len2}${report2}0000`, { status: 200, headers: respHeaders });
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
