import type { IStorageProvider, SessionRecord, GemsConfig } from '@cr/core';

/**
 * Cloud storage provider that persists sessions to a Cloudflare D1 database
 * via the cr-vector-pipeline Worker's REST API.
 */
export class CloudflareStorageProvider implements IStorageProvider {
  readonly type = 'cloud' as const;
  private workerUrl = '';
  private apiKey = '';
  private tokenGetter?: () => string | null;
  private ready = false;

  configure(url: string, apiKey?: string) {
    if (url) {
      this.workerUrl = url.replace(/\/$/, '');
    }
    if (apiKey) {
      this.apiKey = apiKey;
    }
  }

  /**
   * Configure dynamic token source (e.g. from CloudflareAuthProvider.getToken()).
   * When set, this takes priority over the static apiKey.
   */
  configureAuth(tokenGetter: () => string | null) {
    this.tokenGetter = tokenGetter;
  }

  async init(): Promise<void> {
    this.ready = !!this.workerUrl;
    if (!this.ready) {
      console.warn('CloudflareStorageProvider: No worker URL configured.');
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  private authHeaders(json = false): Record<string, string> {
    const h: Record<string, string> = {};
    const token = this.tokenGetter?.() || this.apiKey;
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async saveSession(sessionId: string, data: any): Promise<string> {
    const id = sessionId || `session-${Date.now()}`;
    const preview = data.messages?.length > 0
      ? (data.messages[0].content.substring(0, 40) + '...')
      : 'Empty Session';

    try {
      await fetch(`${this.workerUrl}/api/sessions/${id}`, {
        method: 'PUT',
        headers: this.authHeaders(true),
        body: JSON.stringify({
          timestamp: Date.now(),
          preview,
          customName: data.customName || null,
          config: JSON.stringify(data.config || {}),
          data: JSON.stringify(data),
          isArchived: data.isArchived || false,
        }),
      });
    } catch (err) {
      console.error('CloudflareStorageProvider: Failed to save session:', err);
    }

    return id;
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    if (!this.ready) return [];
    try {
      const res = await fetch(`${this.workerUrl}/api/sessions`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return [];
      const rows: any[] = await res.json();
      return rows.map((row) => this.mapToRecord(row));
    } catch (err) {
      console.error('CloudflareStorageProvider: Failed to load sessions:', err);
      return [];
    }
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    if (!this.ready) return undefined;
    try {
      const res = await fetch(`${this.workerUrl}/api/sessions/${sessionId}`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return undefined;
      const row = await res.json();
      return this.mapToRecord(row);
    } catch (err) {
      console.error(`CloudflareStorageProvider: Failed to load session ${sessionId}:`, err);
      return undefined;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.workerUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: this.authHeaders(),
      });
    } catch (err) {
      console.error(`CloudflareStorageProvider: Failed to delete session ${sessionId}:`, err);
    }
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    try {
      await fetch(`${this.workerUrl}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: this.authHeaders(true),
        body: JSON.stringify({ customName: newName }),
      });
    } catch (err) {
      console.error(`CloudflareStorageProvider: Failed to rename session ${sessionId}:`, err);
    }
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    try {
      await fetch(`${this.workerUrl}/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: this.authHeaders(true),
        body: JSON.stringify({ isArchived: archive }),
      });
    } catch (err) {
      console.error(`CloudflareStorageProvider: Failed to archive session ${sessionId}:`, err);
    }
  }

  async forkSession(sessionId: string): Promise<string | undefined> {
    try {
      const res = await fetch(`${this.workerUrl}/api/sessions/${sessionId}/fork`, {
        method: 'POST',
        headers: this.authHeaders(true),
        body: JSON.stringify({}),
      });
      if (!res.ok) return undefined;
      const data = await res.json() as any;
      return data.id; // Return the new branched session ID
    } catch (err) {
      console.error(`CloudflareStorageProvider: Failed to fork session ${sessionId}:`, err);
      return undefined;
    }
  }

  async clearAll(): Promise<void> {
    // Load all and delete individually (D1 has no TRUNCATE in the REST API)
    const sessions = await this.loadAllSessions();
    for (const session of sessions) {
      await this.deleteSession(session.id);
    }
  }

  /** Returns the configured Worker URL, for use by SearchService cloud path. */
  getWorkerUrl(): string {
    return this.workerUrl;
  }

  /** Returns the configured API key, for use by SearchService cloud path. */
  getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Semantic search via Vectorize.
   * @param query - Natural language search query
   * @param limit - Max number of results (default 10, max 50)
   */
  async search(query: string, limit = 10): Promise<any[]> {
    if (!this.ready || !query?.trim()) return [];
    try {
      const res = await fetch(
        `${this.workerUrl}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        { headers: this.authHeaders() },
      );
      if (!res.ok) return [];
      const { results } = await res.json() as { results: any[] };
      return results || [];
    } catch (err) {
      console.error('CloudflareStorageProvider: Search failed:', err);
      return [];
    }
  }

  async saveGemsConfig(config: GemsConfig): Promise<void> {
    try {
      await fetch(`${this.workerUrl}/api/gems`, {
        method: 'PUT',
        headers: this.authHeaders(true),
        body: JSON.stringify(config),
      });
    } catch (err) {
      console.error('CloudflareStorageProvider: Failed to save gems config:', err);
    }
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    if (!this.ready) return null;
    try {
      const res = await fetch(`${this.workerUrl}/api/gems`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('CloudflareStorageProvider: Failed to load gems config:', err);
      return null;
    }
  }

  private mapToRecord(row: any): SessionRecord {
    return {
      id: row.id,
      timestamp: row.timestamp,
      preview: row.preview,
      customName: row.customName,
      config: row.config ? (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) : undefined,
      data: row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : {},
      parentId: row.parentId,
      forkedAt: row.forkedAt,
      isCloud: true,
      isArchived: !!row.isArchived,
    };
  }
}
