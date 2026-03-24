import type { Env } from './index';
import { requireAuth, isAuthError, jsonResponse, corsResponse } from './index';

export async function handleAdminAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const authResult = await requireAuth(request, env);
  if (isAuthError(authResult)) return authResult;
  const userId = authResult.userId;

  // Proxy Telegram traffic for local dev (bypasses Super Admin strict check, validates Auth)
  if (request.method === 'POST' && path === '/api/admin/telegram-proxy') {
     const body = await request.json() as any;
     if (!body.url) return jsonResponse({ error: 'Missing target url' }, 400);
     try {
       const res = await fetch(body.url, {
          method: body.method || 'POST',
          headers: body.headers || { 'Content-Type': 'application/json' },
          body: body.payload ? JSON.stringify(body.payload) : undefined
       });
       return new Response(await res.text(), { status: res.status });
     } catch (e: any) {
       return jsonResponse({ error: 'Proxy fetch failed' }, 500);
     }
  }

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

  if (request.method === 'GET' && path === '/api/admin/health') {
    try {
      const dbCheck = await env.DB.prepare("SELECT 1").first();
      const aiCheck = env.AI ? 'ok' : 'missing';
      return jsonResponse({
         status: 'healthy',
         timestamp: Date.now(),
         components: {
            database: dbCheck ? 'ok' : 'error',
            ai_binding: aiCheck
         }
      });
    } catch (e: any) {
      return jsonResponse({ status: 'unhealthy', error: e.message }, 500);
    }
  }

  if (request.method === 'GET' && path === '/api/admin/sandboxes') {
    try {
      // List active virtual memory graph sessions
      const { results } = await env.DB.prepare(
        "SELECT id, user_id, estimated_tokens, timestamp, config FROM sessions ORDER BY timestamp DESC LIMIT 50"
      ).all();
      return jsonResponse({ sessions: results });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  if (request.method === 'POST' && path === '/api/admin/bot/register') {
    const body = await request.json() as any;
    if (!body.userId || !body.botToken) {
      return jsonResponse({ error: 'Missing userId or botToken' }, 400);
    }
    try {
      // 1. Set the Webhook to Telegram
      const workerUrl = new URL(request.url).origin;
      const webhookUrl = `${workerUrl}/api/telegram/webhook/${body.botToken}`;
      const tgUrl = `https://api.telegram.org/bot${body.botToken}/setWebhook?url=${webhookUrl}`;
      // Use telegramFetch imported from telegramRoutes to route through proxy
      const { telegramFetch } = await import('./telegramRoutes');
      const tgRes = await telegramFetch(tgUrl, { method: 'POST' }, env);
      if (!tgRes.ok) {
         const tgErr = await tgRes.text();
         return jsonResponse({ error: `Failed to set Telegram webhook: ${tgErr}` }, 500);
      }

      // 2. Save in Database
      await env.DB.prepare(
        "INSERT INTO telegram_integrations (user_id, bot_token, created_at) VALUES (?, ?, strftime('%s','now')) " +
        "ON CONFLICT(user_id) DO UPDATE SET bot_token = excluded.bot_token"
      ).bind(body.userId, body.botToken).run();
      return jsonResponse({ ok: true, note: 'Webhook successfully registered' });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  if (request.method === 'POST' && path === '/api/admin/users/telegram-link') {
    const body = await request.json() as any;
    if (!body.userId || !body.tgUserId) {
      return jsonResponse({ error: 'Missing userId or tgUserId' }, 400);
    }
    try {
      await env.DB.prepare(
        "INSERT INTO telegram_links (tg_user_id, user_id, created_at) VALUES (?, ?, strftime('%s','now')) " +
        "ON CONFLICT(tg_user_id) DO UPDATE SET user_id = excluded.user_id"
      ).bind(body.tgUserId, body.userId).run();
      return jsonResponse({ ok: true });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  if (request.method === 'GET' && path === '/api/admin/issues') {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM issues ORDER BY created_at DESC").all();
      return jsonResponse({ issues: results });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  if (request.method === 'GET' && path.startsWith('/api/admin/issues/') && !path.endsWith('/resolve')) {
    const issueId = path.split('/api/admin/issues/')[1];
    try {
      const issue = await env.DB.prepare("SELECT * FROM issues WHERE id = ?").bind(issueId).first();
      if (!issue) return jsonResponse({ error: 'Issue not found' }, 404);
      return jsonResponse({ issue });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  if (request.method === 'POST' && path.startsWith('/api/admin/issues/') && path.endsWith('/resolve')) {
    const issueId = path.split('/api/admin/issues/')[1].replace('/resolve', '');
    try {
      await env.DB.prepare("UPDATE issues SET status = 'resolved' WHERE id = ?").bind(issueId).run();
      return jsonResponse({ ok: true });
    } catch (e: any) {
      return jsonResponse({ error: 'Database error' }, 500);
    }
  }

  return corsResponse('Not Found', 404);
}

