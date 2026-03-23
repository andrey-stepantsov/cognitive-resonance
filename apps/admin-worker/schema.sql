CREATE TABLE IF NOT EXISTS global_admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  public_key TEXT UNIQUE NOT NULL,
  totp_secret TEXT NOT NULL,
  role_binding TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_environment TEXT,
  timestamp INTEGER NOT NULL,
  ip_address TEXT,
  signature TEXT NOT NULL
);
