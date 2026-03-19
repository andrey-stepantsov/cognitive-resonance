import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

export interface EventRecord {
  id: string;
  session_id: string;
  timestamp: number;
  actor: string;
  type: string;
  payload: string;
  previous_event_id: string | null;
  sync_status?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  nick: string;
  password_hash: string;
  status: string;
}

export class DatabaseEngine {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);

    // Apply migrations if tables already existed
    try {
      this.db.prepare("SELECT sync_status FROM events LIMIT 1").get();
    } catch (err: any) {
      if (err.message.includes("no such column: sync_status")) {
         this.db.exec("ALTER TABLE events ADD COLUMN sync_status TEXT DEFAULT 'PENDING'");
      }
    }
  }

  public getDb(): Database.Database {
    return this.db;
  }

  appendEvent(event: Omit<EventRecord, 'id'> & { id?: string }): string {
    const id = event.id || crypto.randomUUID();
    const sync_status = event.sync_status || 'PENDING';
    const stmt = this.db.prepare(`
      INSERT INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status)
      VALUES (@id, @session_id, @timestamp, @actor, @type, @payload, @previous_event_id, @sync_status)
    `);
    
    // Convert payload object to string if it isn't already
    const payloadStr = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);

    stmt.run({ ...event, id, payload: payloadStr, sync_status });
    
    // Update session head if it's the latest
    this.db.prepare('UPDATE sessions SET head_event_id = ? WHERE id = ?').run(id, event.session_id);
    return id;
  }

  getPendingEvents(): EventRecord[] {
    return this.query("SELECT * FROM events WHERE sync_status = 'PENDING' ORDER BY timestamp ASC") as EventRecord[];
  }

  markEventsSynced(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`UPDATE events SET sync_status = 'SYNCED' WHERE id IN (${placeholders})`).run(...ids);
  }

  getLatestEventTimestamp(): number {
    const row = this.get('SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1') as { timestamp: number } | undefined;
    return row ? row.timestamp : 0;
  }

  insertRemoteEvent(event: EventRecord): void {
    const payloadStr = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
    
    // INSERT OR IGNORE protects against already-pulled events or edge ID collisions
    this.db.prepare(`
      INSERT OR IGNORE INTO events (id, session_id, timestamp, actor, type, payload, previous_event_id, sync_status)
      VALUES (@id, @session_id, @timestamp, @actor, @type, @payload, @previous_event_id, 'SYNCED')
    `).run({ ...event, payload: payloadStr });
    
    this.db.prepare('INSERT OR IGNORE INTO sessions (id, owner_id) VALUES (?, ?)').run(event.session_id, 'REMOTE_USER');
    
    // Optionally update session head if remote event is newer 
    const currentHeadStr = this.get('SELECT head_event_id FROM sessions WHERE id = ?', [event.session_id]);
    if (!currentHeadStr?.head_event_id) {
       this.db.prepare('UPDATE sessions SET head_event_id = ? WHERE id = ?').run(event.id, event.session_id);
    }
  }

  createSession(owner_id: string, id?: string): string {
    const sessionId = id || crypto.randomUUID();
    this.db.prepare('INSERT OR IGNORE INTO sessions (id, owner_id) VALUES (?, ?)').run(sessionId, owner_id);
    return sessionId;
  }

  createArtefact(session_id: string, event_id: string, type: string, content: string, version: number = 1, id?: string): string {
    const artefactId = id || crypto.randomUUID();
    this.db.prepare(`
        INSERT INTO artefacts (id, source_session_id, source_event_id, type, content, version)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(artefactId, session_id, event_id, type, content, version);
    return artefactId;
  }

  promoteEntity(name: string, artefact_id: string, id?: string): string {
    const existing = this.db.prepare('SELECT id, latest_artefact_id FROM entities WHERE name = ?').get(name) as any;
    if (existing) {
      this.db.prepare('UPDATE entities SET previous_artefact_id = ?, latest_artefact_id = ? WHERE id = ?')
        .run(existing.latest_artefact_id, artefact_id, existing.id);
      return existing.id;
    } else {
      const entityId = id || crypto.randomUUID();
      this.db.prepare('INSERT INTO entities (id, name, latest_artefact_id) VALUES (?, ?, ?)')
        .run(entityId, name, artefact_id);
      return entityId;
    }
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
  }

  getUserById(id: string): UserRecord | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  }

  upsertUser(user: UserRecord) {
    this.db.prepare(`
      INSERT INTO users (id, email, nick, password_hash, status)
      VALUES (@id, @email, @nick, @password_hash, @status)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        nick = excluded.nick,
        password_hash = excluded.password_hash,
        status = excluded.status
    `).run(user);
    
    // Wait, SQLite ON CONFLICT requires a UNIQUE index or PRIMARY KEY on the conflict target.
    // id is PRIMARY KEY, so this is valid SQLite 3.24+ syntax.
  }

  getArtefact(id: string) {
    return this.db.prepare('SELECT * FROM artefacts WHERE id = ?').get(id);
  }

  getEntityByName(name: string) {
    return this.db.prepare('SELECT * FROM entities WHERE name = ?').get(name);
  }

  query(sql: string, params: any[] = []): any[] {
    return this.db.prepare(sql).all(...params);
  }
  
  exec(sql: string, params: any[] = []): void {
    this.db.prepare(sql).run(...params);
  }
  
  get(sql: string, params: any[] = []): any {
    return this.db.prepare(sql).get(...params);
  }

  close() {
    this.db.close();
  }
}
