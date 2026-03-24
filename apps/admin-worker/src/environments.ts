import { Hono } from 'hono';

// Define expected DB schemas locally for the binding cast if needed,
type Bindings = {
  DB_ADMIN: D1Database;
  JWT_SECRET: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
};

const environments = new Hono<{ Bindings: Bindings, Variables: { admin: any } }>();

// Provision a new environment
environments.post('/', async (c) => {
  const admin = c.get('admin');
  
  // Basic RBAC check
  const roleBinding = JSON.parse(admin.role_binding || '{}');
  if (!roleBinding.superadmin && !roleBinding.env_admin) {
    return c.json({ error: 'Forbidden: Insufficient RBAC privileges to provision environments' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { name, type } = body;

  if (!name || !type) {
    return c.json({ error: 'Missing environment name or type' }, 400);
  }

  const accountId = c.env.CF_ACCOUNT_ID;
  const apiToken = c.env.CF_API_TOKEN;
  let metadata: any = { status: 'mock_provisioned' };

  try {
    // Ensuring idempotent tracking of environments
    await c.env.DB_ADMIN.prepare(
      `CREATE TABLE IF NOT EXISTS environments (
        name TEXT PRIMARY KEY,
        type TEXT,
        status TEXT,
        created_by TEXT,
        created_at INTEGER,
        metadata TEXT
      )`
    ).run();

    if (accountId && apiToken) {
      const headers = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      };

      // 1. D1 Database
      const d1Res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`, {
        method: 'POST', headers, body: JSON.stringify({ name: \`env_\${name}_db\` })
      });
      const d1Data = await d1Res.json() as any;

      // 2. Vectorize Index
      const vecRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes`, {
        method: 'POST', headers, body: JSON.stringify({ name: \`env_\${name}_vec\`, config: { dimensions: 1536, metric: "cosine" } })
      });
      const vecData = await vecRes.json() as any;

      // 3. KV Namespace
      const kvRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, {
        method: 'POST', headers, body: JSON.stringify({ title: \`env_\${name}_kv\` })
      });
      const kvData = await kvRes.json() as any;

      metadata = {
        d1_id: d1Data?.result?.uuid || null,
        vec_name: vecData?.result?.name || null,
        kv_id: kvData?.result?.id || null,
        status: 'live'
      };
    }

    await c.env.DB_ADMIN.prepare(
      `INSERT INTO environments (name, type, status, created_by, created_at, metadata)
       VALUES (?, ?, 'provisioned', ?, ?, ?)`
    ).bind(name, type, admin.id, Date.now(), JSON.stringify(metadata)).run();

    return c.json({
      status: 'provisioned',
      environment: { name, type },
      orchestrator: 'admin-worker',
      metadata
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Teardown an existing environment
environments.delete('/:name', async (c) => {
  const admin = c.get('admin');
  
  const roleBinding = JSON.parse(admin.role_binding || '{}');
  if (!roleBinding.superadmin && !roleBinding.env_admin) {
    return c.json({ error: 'Forbidden: Insufficient RBAC privileges' }, 403);
  }

  const name = c.req.param('name');
  const accountId = c.env.CF_ACCOUNT_ID;
  const apiToken = c.env.CF_API_TOKEN;

  try {
    const query = await c.env.DB_ADMIN.prepare("SELECT * FROM environments WHERE name = ?").bind(name).first();
    if (!query) return c.json({ error: 'Environment not found' }, 404);

    if (accountId && apiToken) {
      let meta: any = {};
      try { meta = JSON.parse((query as any).metadata || '{}'); } catch(e){}

      const headers = { 'Authorization': `Bearer ${apiToken}` };

      if (meta.d1_id) {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${meta.d1_id}`, { method: 'DELETE', headers });
      }
      if (meta.vec_name) {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${meta.vec_name}`, { method: 'DELETE', headers });
      }
      if (meta.kv_id) {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${meta.kv_id}`, { method: 'DELETE', headers });
      }
    }

    await c.env.DB_ADMIN.prepare(`DELETE FROM environments WHERE name = ?`).bind(name).run();
    
    return c.json({
      status: 'destroyed',
      environment: name 
    });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Get environment statuses
environments.get('/', async (c) => {
  try {
    // Graceful check in case the table hasn't been created yet
    const query = await c.env.DB_ADMIN.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='environments'").first();
    if (!query) return c.json({ environments: [] });

    const { results } = await c.env.DB_ADMIN.prepare("SELECT * FROM environments").all();
    return c.json({ environments: results });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Advanced: Lockdown/Quarantine Environment
environments.post('/:name/lockdown', async (c) => {
  const admin = c.get('admin');
  const roleBinding = JSON.parse(admin.role_binding || '{}');
  if (!roleBinding.superadmin && !roleBinding.env_admin) return c.json({ error: 'Forbidden' }, 403);

  const name = c.req.param('name');
  try {
    const result = await c.env.DB_ADMIN.prepare(
      "UPDATE environments SET status = 'quarantined' WHERE name = ?"
    ).bind(name).run();
    if (!result.success) throw new Error('Failed to update status');
    return c.json({ status: 'quarantined', environment: name });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Advanced: Set Hard Quotas
environments.put('/:name/quotas', async (c) => {
  const admin = c.get('admin');
  const roleBinding = JSON.parse(admin.role_binding || '{}');
  if (!roleBinding.superadmin && !roleBinding.env_admin) return c.json({ error: 'Forbidden' }, 403);

  const name = c.req.param('name');
  const body = await c.req.json().catch(() => ({}));
  if (!body.quotas) return c.json({ error: 'Missing quotas' }, 400);

  try {
    const query = await c.env.DB_ADMIN.prepare("SELECT metadata FROM environments WHERE name = ?").bind(name).first();
    if (!query) return c.json({ error: 'Environment not found' }, 404);

    let meta: any = {};
    try { meta = JSON.parse((query as any).metadata || '{}'); } catch(e){}
    meta.quotas = body.quotas;

    await c.env.DB_ADMIN.prepare(
      "UPDATE environments SET metadata = ? WHERE name = ?"
    ).bind(JSON.stringify(meta), name).run();
    
    return c.json({ status: 'quotas_updated', environment: name, quotas: body.quotas });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Advanced: Health/Drift Detection
environments.get('/:name/health', async (c) => {
  const name = c.req.param('name');
  try {
    const query = await c.env.DB_ADMIN.prepare("SELECT * FROM environments WHERE name = ?").bind(name).first();
    if (!query) return c.json({ error: 'Environment not found' }, 404);

    let meta: any = {};
    try { meta = JSON.parse((query as any).metadata || '{}'); } catch(e){}

    const accountId = c.env.CF_ACCOUNT_ID;
    const apiToken = c.env.CF_API_TOKEN;
    if (!accountId || !apiToken || meta.status === 'mock_provisioned') {
      return c.json({ status: 'healthy', drift: false, mode: 'mock' });
    }

    const headers = { 'Authorization': `Bearer ${apiToken}` };
    const checks = await Promise.all([
      meta.d1_id ? fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${meta.d1_id}`, { headers }) : Promise.resolve({ ok: true }),
      meta.vec_name ? fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${meta.vec_name}`, { headers }) : Promise.resolve({ ok: true }),
      meta.kv_id ? fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${meta.kv_id}`, { headers }) : Promise.resolve({ ok: true })
    ]);

    const drift = checks.some(r => !r.ok);
    return c.json({ status: drift ? 'drifted' : 'healthy', drift, mode: 'live' });
  } catch(e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default environments;
