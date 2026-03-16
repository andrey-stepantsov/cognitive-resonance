CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  preview TEXT,
  custom_name TEXT,
  config TEXT,
  data TEXT,
  is_archived INTEGER DEFAULT 0,
  user_id TEXT DEFAULT 'legacy'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, timestamp DESC);

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
