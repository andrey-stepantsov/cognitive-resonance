import type { IStorageProvider, SessionRecord, GemsConfig } from '../interfaces/IStorageProvider';
import type { IAuthProvider } from '../interfaces/IAuthProvider';

/**
 * A storage provider that synchronizes directly with the Cloudflare D1 Backend
 * using REST API calls. Bypasses local IndexedDB/SQLite entirely for a Local-First Cloud Experience.
 */
export class RemoteStorageProvider implements IStorageProvider {
  public readonly type = 'cloud';
  private apiUrl: string;
  private auth: IAuthProvider;

  constructor(auth: IAuthProvider) {
    this.auth = auth;
    this.apiUrl = typeof process !== 'undefined' && process.env?.VITE_CLOUDFLARE_WORKER_URL
        ? process.env.VITE_CLOUDFLARE_WORKER_URL
        : (import.meta.env?.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787');
  }

  isReady(): boolean {
    return this.auth.getStatus() === 'authenticated' && !!this.auth.getToken?.();
  }

  private async fetchBackend(path: string, options: RequestInit = {}): Promise<Response> {
    const token = this.auth.getToken?.();
    if (!token) {
      throw new Error('RemoteStorageProvider: Not authenticated or missing token');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`
    };

    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    const mergedOptions = {
      ...options,
      headers: { ...headers, ...options.headers }
    };

    const res = await fetch(`${this.apiUrl}${path}`, mergedOptions);
    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown Error');
      throw new Error(`Backend Error ${res.status}: ${err}`);
    }
    return res;
  }

  async createSession(sessionId: string, config?: any): Promise<void> {
    await this.fetchBackend('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionId, config })
    });
  }

  async appendEvent(sessionId: string, type: string, payload: any): Promise<void> {
    await this.fetchBackend(`/api/events/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({
         type,
         payload: JSON.stringify(payload)
      })
    });
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    const res = await this.fetchBackend('/api/sessions');
    const data = await res.json();
    return data.sessions.map((s: any) => ({
      id: s.id,
      timestamp: new Date(s.created_at).getTime(),
      preview: `Session ${s.id.substring(0, 8)}`,
      data: {},
      isCloud: true,
      isArchived: false,
      userId: s.user_id,
      customName: s.name || undefined
    }));
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    const res = await this.fetchBackend(`/api/sessions/${sessionId}`);
    const data = await res.json();
    
    // RemoteStorageProvider transforms the array of raw backend events into standard payload logs
    const unifiedRecord: SessionRecord = {
      id: data.session.id,
      timestamp: new Date(data.session.created_at).getTime(),
      preview: `Session ${data.session.id.substring(0, 8)}`,
      data: data.events.map((e: any) => ({
        id: e.id,
        type: e.type,
        actor: e.actor,
        payload: JSON.parse(e.payload),
        timestamp: new Date(e.timestamp).getTime()
      })),
      isCloud: true,
      isArchived: false,
      userId: data.session.user_id,
      customName: data.session.name || undefined
    };

    return unifiedRecord;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.fetchBackend(`/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    await this.fetchBackend(`/api/sessions/${sessionId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName })
    });
  }

  // --- Optional / Non-critical Methods ---
  async saveGemsConfig(_config: GemsConfig): Promise<void> {
    // Optional feature: sync gems to edge later, fallback to local for now or ignore
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    return null; 
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    // Append a toggle event per our architecture instead of destructive update
    await this.appendEvent(sessionId, 'PWA_ARCHIVE_TOGGLE', { isArchived: archive });
  }

  async forkSession(sessionId: string): Promise<string | undefined> {
    const res = await this.fetchBackend(`/api/sessions/${sessionId}/fork`, {
      method: 'POST'
    });
    const data = await res.json();
    return data.newSessionId;
  }
}
