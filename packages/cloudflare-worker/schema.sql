CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  preview TEXT,
  custom_name TEXT,
  config TEXT,
  data TEXT,
  is_archived INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gems_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  config TEXT
);
