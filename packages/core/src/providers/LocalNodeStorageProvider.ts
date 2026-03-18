import type { IStorageProvider, SessionRecord, GemsConfig } from '../interfaces/IStorageProvider';
import { reduceSessionState } from '../services/EventReducers';
import type { IEvent } from '../interfaces/IEvents';

export class LocalNodeStorageProvider implements IStorageProvider {
  readonly type = 'local' as const;
  private baseUrl = 'http://localhost:3000';
  private ready = false;

  async init(): Promise<void> {
    try {
      // Ping the server to ensure it's up
      const res = await fetch(`${this.baseUrl}/api/sessions`);
      if (res.ok) {
        this.ready = true;
      }
    } catch (e) {
      console.warn('LocalNodeStorageProvider: CLI node server not reachable on port 3000.');
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async createSession(sessionId: string, config?: any): Promise<void> {
    if (!this.ready) return;
    try {
      await fetch(`${this.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, owner_id: 'LOCAL_FRONTEND' }),
      });

      if (config) {
        await this.appendEvent(sessionId, 'SESSION_CREATED', { config });
      }
    } catch (err) {
      console.error('LocalNodeStorageProvider: Failed to create session:', err);
    }
  }

  async appendEvent(sessionId: string, type: string, payload: any): Promise<void> {
    if (!this.ready) return;
    try {
      await fetch(`${this.baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: 'LOCAL_FRONTEND',
          type,
          payload: JSON.stringify(payload),
          previous_event_id: null
        }),
      });
    } catch (err) {
      console.error(`LocalNodeStorageProvider: Failed to append event ${type}:`, err);
    }
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    if (!this.ready) return [];
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions`);
      if (!res.ok) return [];
      const sessions = await res.json() as any[];
      
      const records: SessionRecord[] = [];
      for (const s of sessions) {
        const rec = await this.loadSession(s.id);
        if (rec) records.push(rec);
      }
      return records;
    } catch (err) {
      console.error('LocalNodeStorageProvider: Failed to load all sessions:', err);
      return [];
    }
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    if (!this.ready) return undefined;
    try {
      const res = await fetch(`${this.baseUrl}/api/events/${sessionId}`);
      if (!res.ok) return undefined;
      const events = await res.json() as IEvent[];

      return reduceSessionState(events, sessionId);
    } catch (err) {
      console.error(`LocalNodeStorageProvider: Failed to load session ${sessionId}:`, err);
      return undefined;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    console.warn(`LocalNodeStorageProvider: Deletion logic via events not fully supported in simple mock yet.`);
    // Since it's Event-Sourcing, we theoretically append a "DELETED" event which prevents it loading later!
    try {
      await fetch(`${this.baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: 'LOCAL_FRONTEND',
          type: 'PWA_DELETE',
          payload: '{}',
          previous_event_id: null
        }),
      });
    } catch (err) {
      console.error('LocalNodeStorageProvider: Failed to delete session:', err);
    }
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: 'LOCAL_FRONTEND',
          type: 'PWA_RENAME',
          payload: JSON.stringify({ customName: newName }),
          previous_event_id: null
        }),
      });
    } catch (err) {
      console.error('LocalNodeStorageProvider: Failed to rename session:', err);
    }
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    try {
       await fetch(`${this.baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          timestamp: Date.now(),
          actor: 'LOCAL_FRONTEND',
          type: 'PWA_ARCHIVE_TOGGLE',
          payload: JSON.stringify({ isArchived: archive }),
          previous_event_id: null
        }),
      });
    } catch (err) {
      console.error('LocalNodeStorageProvider: Failed to archive session:', err);
    }
  }

  async forkSession(_sessionId: string): Promise<string | undefined> {
    console.warn('LocalNodeStorageProvider: Fork not supported yet');
    return undefined;
  }

  async clearAll(): Promise<void> {
    console.warn('LocalNodeStorageProvider: clearAll not supported');
  }

  async saveGemsConfig(_config: GemsConfig): Promise<void> {
    // For local frontend, gem config might be mapped to a special session or ignored.
    console.warn('LocalNodeStorageProvider: saveGemsConfig not supported yet');
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    return null;
  }
  
  // Need to update loadSession to ignore DELETED events
}
