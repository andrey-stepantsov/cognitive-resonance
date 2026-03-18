CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    actor TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    previous_event_id TEXT,
    sync_status TEXT DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    head_event_id TEXT
);

CREATE TABLE IF NOT EXISTS artefacts (
    id TEXT PRIMARY KEY,
    source_session_id TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latest_artefact_id TEXT,
    previous_artefact_id TEXT
);

CREATE TABLE IF NOT EXISTS workspace_items (
    workspace_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    PRIMARY KEY (workspace_id, entity_id)
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nick TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);
