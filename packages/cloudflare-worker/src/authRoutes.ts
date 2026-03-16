import type { Env } from './index';
import { hashPassword, verifyPassword, signJwt, generateApiKey } from './auth';
import { requireAuth, isAuthError, jsonResponse, corsResponse } from './index';

export async function handleAuthAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // --- Public Routes ---

  if (request.method === 'POST' && path === '/api/auth/signup') {
    const body = await request.json() as any;
    if (!body.email || !body.password || !body.name) {
      return jsonResponse({ error: 'Missing fields' }, 400);
    }
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(body.password);
    
    try {
      await env.DB.prepare(
        'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, body.email, passwordHash, body.name, Date.now()).run();
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        return jsonResponse({ error: 'Email already exists' }, 409);
      }
      return jsonResponse({ error: 'Database error' }, 500);
    }
    
    const jwt = await signJwt({ userId: id, email: body.email }, env.JWT_SECRET || 'default_secret');
    return jsonResponse({ token: jwt, user: { id, email: body.email, name: body.name } });
  }

  if (request.method === 'POST' && path === '/api/auth/login') {
    const body = await request.json() as any;
    if (!body.email || !body.password) {
      return jsonResponse({ error: 'Missing fields' }, 400);
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first();
    if (!user) return jsonResponse({ error: 'Invalid credentials' }, 401);
    
    const valid = await verifyPassword(body.password, user.password_hash as string);
    if (!valid) return jsonResponse({ error: 'Invalid credentials' }, 401);
    
    const jwt = await signJwt({ userId: user.id, email: user.email }, env.JWT_SECRET || 'default_secret');
    return jsonResponse({ token: jwt, user: { id: user.id, email: user.email, name: user.name } });
  }

  // --- Protected Routes ---
  const authResult = await requireAuth(request, env);
  if (isAuthError(authResult)) return authResult;
  const userId = authResult.userId;

  if (request.method === 'GET' && path === '/api/auth/me') {
    const user = await env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').bind(userId).first();
    if (user) {
      return jsonResponse({ user });
    }
    // Fallback for default API_KEY user
    return jsonResponse({ user: { id: userId, email: userId + '@legacy', name: 'Legacy User' } });
  }

  if (request.method === 'POST' && path === '/api/auth/keys') {
    const body = await request.json() as any;
    const [plainKey, keyHash] = await generateApiKey();
    await env.DB.prepare(
      'INSERT INTO api_keys (key_hash, user_id, name, created_at) VALUES (?, ?, ?, ?)'
    ).bind(keyHash, userId, body.name || 'API Key', Date.now()).run();
    return jsonResponse({ apiKey: plainKey, name: body.name || 'API Key' });
  }

  if (request.method === 'GET' && path === '/api/auth/keys') {
    const { results } = await env.DB.prepare(
      'SELECT key_hash, name, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    return jsonResponse({ keys: results || [] });
  }

  if (request.method === 'DELETE' && path.startsWith('/api/auth/keys/')) {
    const keyHashToRevoke = path.split('/').pop();
    if (!keyHashToRevoke) return jsonResponse({ error: 'Missing key ID' }, 400);
    
    await env.DB.prepare('DELETE FROM api_keys WHERE key_hash = ? AND user_id = ?').bind(keyHashToRevoke, userId).run();
    return jsonResponse({ ok: true });
  }

  return corsResponse('Not Found', 404);
}
