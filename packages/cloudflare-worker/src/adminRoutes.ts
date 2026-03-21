import type { Env } from './index';
import { requireAuth, isAuthError, jsonResponse, corsResponse } from './index';

export async function handleAdminAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const authResult = await requireAuth(request, env);
  if (isAuthError(authResult)) return authResult;
  const userId = authResult.userId;

  // Super Admin Check
  if (!env.SECRET_SUPER_ADMIN_IDS) {
    return jsonResponse({ error: 'Super Admin disabled' }, 403);
  }
  
  let superAdmins: string[] = [];
  try {
    superAdmins = typeof env.SECRET_SUPER_ADMIN_IDS === 'string' 
      ? JSON.parse(env.SECRET_SUPER_ADMIN_IDS) 
      : env.SECRET_SUPER_ADMIN_IDS;
  } catch (e) {
    // maybe comma separated
    superAdmins = String(env.SECRET_SUPER_ADMIN_IDS).split(',').map(s => s.trim());
  }

  if (!superAdmins.includes(userId)) {
    return jsonResponse({ error: 'Forbidden: Super Admin only' }, 403);
  }

  if (request.method === 'POST' && path === '/api/admin/users/revoke') {
    const body = await request.json() as any;
    if (!body.userId) return jsonResponse({ error: 'Missing userId' }, 400);

    try {
      await env.DB.prepare(
        "INSERT INTO revoked_identities (identity, revoked_at) VALUES (?, strftime('%s','now'))"
      ).bind(body.userId).run();
      return jsonResponse({ ok: true });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE') || e.message?.toLowerCase().includes('constraint')) {
        return jsonResponse({ ok: true, note: 'Already revoked' });
      }
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  if (request.method === 'DELETE' && path === '/api/admin/users/revoke') {
    const body = await request.json() as any;
    if (!body.userId) return jsonResponse({ error: 'Missing userId' }, 400);

    try {
      await env.DB.prepare(
        "DELETE FROM revoked_identities WHERE identity = ?"
      ).bind(body.userId).run();
      return jsonResponse({ ok: true });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  return corsResponse('Not Found', 404);
}
