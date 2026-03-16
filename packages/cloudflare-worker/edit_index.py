import os

index_path = '/Users/stepants/dev/cognitive-resonance/packages/cloudflare-worker/src/index.ts'
with open(index_path, 'r') as f:
    content = f.read()

# 1. Add imports
import_statement = "import {\n  verifyJwt,\n  signJwt,\n  hashPassword,\n  verifyPassword,\n  generateApiKey,\n} from './auth';\n\n"
content = content.replace("export { RoomSession } from './roomSession';", import_statement + "export { RoomSession } from './roomSession';")

# 2. Export jsonResponse and corsResponse
content = content.replace("function jsonResponse(data: any, status = 200): Response {", "export function jsonResponse(data: any, status = 200): Response {")
content = content.replace("function corsResponse(body: string | null, status: number, extraHeaders?: Record<string, string>): Response {", "export function corsResponse(body: string | null, status: number, extraHeaders?: Record<string, string>): Response {")

# 3. Export isAuthError
content = content.replace("function isAuthError(result: Response | AuthResult): result is Response {", "export function isAuthError(result: Response | AuthResult): result is Response {")

# 4. Remove base64UrlDecode, decodeJwtParts, verifyJwt blocks
import re

# Match from "/**\n * Base64url decode (RFC 7515)." to just before "// ─── Appwrite JWT verification"
pattern = r"/\*\*\n \* Base64url decode \(RFC 7515\)\..*?// ─── Appwrite JWT verification"
content = re.sub(pattern, "// ─── Appwrite JWT verification", content, flags=re.DOTALL)

# 5. Replace requireAuth
old_requireAuth = """export async function requireAuth(request: Request, env: Env): Promise<Response | AuthResult> {
  let token = '';

  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
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
}"""

new_requireAuth = """export async function requireAuth(request: Request, env: Env): Promise<Response | AuthResult> {
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

  // 1. Try Appwrite JWKS (RS256) if configured
  if (env.APPWRITE_ENDPOINT) {
    const result = await verifyAppwriteJwt(token, env.APPWRITE_ENDPOINT, env.APPWRITE_PROJECT_ID);
    if (result) return result;
  }

  // 2. Try HMAC if JWT_SECRET is configured
  if (env.JWT_SECRET) {
    const result = await verifyJwt(token, env.JWT_SECRET);
    if (result) return result;
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
}"""

content = content.replace(old_requireAuth, new_requireAuth)

# 6. Add handleAuthAPI import
content = content.replace("export { RoomSession } from './roomSession';", "import { handleAuthAPI } from './authRoutes';\nexport { RoomSession } from './roomSession';")

# 7. Add routing for /api/auth
fetch_route_hook = """    // --- Rate Limiting ---
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return corsResponse('Rate limit exceeded. Try again later.', 429);
    }

    // --- Auth API ---
    if (path.startsWith('/api/auth')) {
      return handleAuthAPI(request, env);
    }"""

content = content.replace("""    // --- Rate Limiting ---
    const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return corsResponse('Rate limit exceeded. Try again later.', 429);
    }""", fetch_route_hook)

with open(index_path, 'w') as f:
    f.write(content)

print("Updated index.ts successfully.")
