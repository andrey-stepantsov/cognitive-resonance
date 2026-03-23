import { Hono } from 'hono';

// Define expected DB schemas locally for the binding cast if needed,
type Bindings = {
  DB_ADMIN: D1Database;
  JWT_SECRET: string;
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

  // Orchestrate underlying Cloudflare infrastructure...
  // For now, securely log the intent to D1 audit logs or environment registry table.
  try {
    // Ensuring idempotent tracking of environments
    await c.env.DB_ADMIN.prepare(
      `CREATE TABLE IF NOT EXISTS environments (
        name TEXT PRIMARY KEY,
        type TEXT,
        status TEXT,
        created_by TEXT,
        created_at INTEGER
      )`
    ).run();

    await c.env.DB_ADMIN.prepare(
      `INSERT INTO environments (name, type, status, created_by, created_at)
       VALUES (?, ?, 'provisioning', ?, ?)`
    ).bind(name, type, admin.id, Date.now()).run();

    return c.json({
      status: 'provisioning',
      environment: { name, type },
      orchestrator: 'admin-worker'
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

  try {
    // Teardown infrastructure logic...
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

export default environments;
