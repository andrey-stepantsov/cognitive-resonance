CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  preview TEXT,
  custom_name TEXT,
  config TEXT,
  data TEXT,
  parent_id TEXT,
  forked_at INTEGER,
  is_archived INTEGER DEFAULT 0,
  user_id TEXT DEFAULT 'legacy',
  has_graph INTEGER DEFAULT 0,
  semantic_graph TEXT,
  estimated_tokens INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  previous_event_id TEXT,
  user_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_sync ON events(user_id, session_id, timestamp);

CREATE TABLE IF NOT EXISTS gems_config (
  id TEXT NOT NULL DEFAULT 'default',
  config TEXT,
  user_id TEXT NOT NULL DEFAULT 'legacy',
  PRIMARY KEY (id, user_id)
);

CREATE TABLE IF NOT EXISTS room_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_chats_room ON room_chats(room_id, timestamp);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS revoked_identities (
  identity TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_bot_logs_time ON bot_logs(timestamp DESC);

CREATE TABLE IF NOT EXISTS telegram_integrations (
  user_id TEXT PRIMARY KEY,
  bot_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_links (
  tg_user_id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

