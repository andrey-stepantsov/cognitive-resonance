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

// ─── Appwrite RS256 JWKS verification ────────────────────────────

/** Cached JWKS keys, keyed by endpoint */
const jwksCache = new Map<string, { keys: Map<string, CryptoKey>; fetchedAt: number }>();
const JWKS_CACHE_TTL = 3600_000; // 1 hour

/** Clear the JWKS cache (for testing). */
export function clearJwksCache() {
  jwksCache.clear();
}

/**
 * Fetch and cache Appwrite public keys from the JWKS endpoint.
 */
async function getAppwritePublicKey(endpoint: string, kid: string): Promise<CryptoKey | null> {
  const cached = jwksCache.get(endpoint);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL) {
    return cached.keys.get(kid) || null;
  }

  try {
    // Appwrite exposes JWKS at /.well-known/jwks.json or /v1/account/jwks
    // Try account/jwks first (Appwrite Cloud pattern)
    const jwksUrl = endpoint.endsWith('/v1')
      ? `${endpoint}/account/jwks`
      : `${endpoint}/v1/account/jwks`;

    const response = await fetch(jwksUrl);
    if (!response.ok) return null;

    const jwks = await response.json() as { keys: any[] };
    const keyMap = new Map<string, CryptoKey>();

    for (const jwk of jwks.keys) {
      if (jwk.kty === 'RSA' && jwk.use === 'sig') {
        const cryptoKey = await crypto.subtle.importKey(
          'jwk',
          { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg || 'RS256' },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        keyMap.set(jwk.kid || 'default', cryptoKey);
      }
    }

    jwksCache.set(endpoint, { keys: keyMap, fetchedAt: Date.now() });
    return keyMap.get(kid) || (keyMap.size === 1 ? keyMap.values().next().value! : null);
  } catch {
    return null;
  }
}

/**
 * Verify an Appwrite-issued RS256 JWT.
 */
export async function verifyAppwriteJwt(token: string, endpoint: string): Promise<{ userId: string } | null> {
  try {
    const decoded = decodeJwtParts(token);
    if (!decoded) return null;

    const { header, payload, signatureB64, headerB64, payloadB64 } = decoded;

    if (header.alg !== 'RS256') return null;

    const kid = header.kid || 'default';
    const publicKey = await getAppwritePublicKey(endpoint, kid);
    if (!publicKey) return null;

    // Verify the RSA signature
    const encoder = new TextEncoder();
    const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signatureInput);
    if (!valid) return null;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Appwrite JWTs use 'userId' claim
    const userId = payload.userId || payload.sub || payload.user_id;
    if (!userId) return null;

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
    const result = await verifyAppwriteJwt(token, env.APPWRITE_ENDPOINT);
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

async function handleGitInfoRefs(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const service = url.searchParams.get('service');

  if (service !== 'git-receive-pack' && service !== 'git-upload-pack') {
    return corsResponse('Unsupported git service', 400);
  }

  // Extract sessionId from /git/:sessionId/info/refs
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
    // Check if any packfiles exist for this session — scoped to user
    const prefix = `${userId}/pack-${sessionId}-`;
    const listed = await env.GIT_PACKS_BUCKET.list({ prefix, limit: 1 });

    if (listed.objects.length > 0) {
      // Advertise a dummy SHA on refs/heads/main so the client knows there's content
      const dummySha = '0'.repeat(40);
      capsLine = `${dummySha} refs/heads/main\0report-status agent=cr-cloudflare-v1\n`;
    } else {
      capsLine = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v1\n`;
    }
  } else {
    capsLine = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v1\n`;
  }

  const len3 = (capsLine.length + 4).toString(16).padStart(4, '0');
  const body = `${len1}${str1}0000${len3}${capsLine}0000`;
  return new Response(body, { status: 200, headers });
}

async function handleGitReceivePack(request: Request, env: Env, userId: string): Promise<Response> {
  const packfileBuffer = await request.arrayBuffer();
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[2];

  console.log(`Received packfile of ${packfileBuffer.byteLength} bytes for session ${sessionId}`);

  try {
    if (env.GIT_PACKS_BUCKET) {
      // Namespace R2 key with userId
      const fileName = `${userId}/pack-${sessionId}-${Date.now()}.pack`;
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

// TODO: The git-upload-pack handler currently serves the entire latest .pack file
// from R2 without object-level negotiation. A future phase should unpack individual
// git objects from the packfiles so the server can do fine-grained "want/have"
// negotiation and send only the objects the client is missing.

async function handleGitUploadPack(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[2];

  if (!env.GIT_PACKS_BUCKET) {
    return corsResponse('R2 bucket not configured', 500);
  }

  // Find packfiles for this session — scoped to user
  const prefix = `${userId}/pack-${sessionId}-`;
  const listed = await env.GIT_PACKS_BUCKET.list({ prefix });

  if (listed.objects.length === 0) {
    // No packs — send NAK (nothing to send)
    const headers = new Headers({
      'Content-Type': 'application/x-git-upload-pack-result',
      'Cache-Control': 'no-cache',
      ...corsHeaders,
    });
    const nakLine = 'NAK\n';
    const lenNak = (nakLine.length + 4).toString(16).padStart(4, '0');
    return new Response(`${lenNak}${nakLine}0000`, { status: 200, headers });
  }

  // Get the latest pack (sorted by key which includes timestamp)
  const sorted = listed.objects.sort((a, b) => b.key.localeCompare(a.key));
  const latestPack = await env.GIT_PACKS_BUCKET.get(sorted[0].key);

  if (!latestPack) {
    return corsResponse('Pack not found', 404);
  }

  const packBytes = await latestPack.arrayBuffer();

  // Build response: NAK + sideband pack data
  const headers = new Headers({
    'Content-Type': 'application/x-git-upload-pack-result',
    'Cache-Control': 'no-cache',
    ...corsHeaders,
  });

  const nakLine = 'NAK\n';
  const lenNak = (nakLine.length + 4).toString(16).padStart(4, '0');

  // Sideband channel 1 = pack data
  const packData = new Uint8Array(packBytes);
  const sideband = new Uint8Array(packData.length + 1);
  sideband[0] = 0x01; // sideband channel 1
  sideband.set(packData, 1);

  const sidebandLen = (sideband.length + 4).toString(16).padStart(4, '0');

  // Combine: NAK line + sideband pack + flush
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

  return new Response(response, { status: 200, headers });
}
