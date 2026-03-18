import type { IStorageProvider, SessionRecord, GemsConfig } from '../interfaces/IStorageProvider';

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

  async saveSession(sessionId: string, data: any): Promise<string> {
    if (!this.ready) return sessionId;
    const id = sessionId || `session-${Date.now()}`;

    try {
      // Ensure session exists
      await fetch(`${this.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, owner_id: 'LOCAL_FRONTEND' }),
      });

      // Append snapshot event
      await fetch(`${this.baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: id,
          timestamp: Date.now(),
          actor: 'LOCAL_FRONTEND',
          type: 'PWA_SNAPSHOT',
          payload: JSON.stringify(data),
          previous_event_id: null
        }),
      });
    } catch (err) {
      console.error('LocalNodeStorageProvider: Failed to save session:', err);
    }

    return id;
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
      const events = await res.json() as any[];

      let data: any = {};
      let isArchived = false;
      let timestamp = 0;
      let hasSnapshot = false;
      let customName = null;

      for (const evt of events) {
        if (evt.type === 'PWA_SNAPSHOT') {
          data = JSON.parse(evt.payload || '{}');
          isArchived = !!data.isArchived;
          timestamp = evt.timestamp;
          customName = data.customName || null;
          hasSnapshot = true;
        } else if (evt.type === 'PWA_ARCHIVE_TOGGLE') {
          const payload = JSON.parse(evt.payload || '{}');
          isArchived = payload.isArchived;
          data.isArchived = isArchived;
        } else if (evt.type === 'PWA_RENAME') {
          const payload = JSON.parse(evt.payload || '{}');
          customName = payload.customName;
          data.customName = customName;
        }
      }

      if (!hasSnapshot) return undefined;

      const preview = data.messages?.length > 0 
        ? data.messages[0].content.substring(0, 40) + '...'
        : 'Empty Session';

      return {
        id: sessionId,
        timestamp,
        preview,
        customName,
        config: data.config,
        data,
        isCloud: false,
        isArchived,
      };
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
