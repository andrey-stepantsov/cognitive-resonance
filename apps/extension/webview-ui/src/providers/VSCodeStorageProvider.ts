import type { IStorageProvider, SessionRecord, GemsConfig } from '@cr/core';

// Ensure vscode API is available
// @ts-ignore
const vscode = window.vscode;

export class VSCodeStorageProvider implements IStorageProvider {
  readonly type = 'local';
  private ready = false;
  
  // Pending promises for IPC calls
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private loadSessionsResolve: ((sessions: SessionRecord[]) => void) | null = null;
  private loadSessionResolve: ((session: SessionRecord) => void) | null = null;
  private loadGemsResolve: ((config: GemsConfig) => void) | null = null;

  constructor() {
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent) {
    const message = event.data;
    
    if (message.type === 'sessions_loaded' && this.loadSessionsResolve) {
      this.loadSessionsResolve(message.sessions || []);
      this.loadSessionsResolve = null;
    } else if (message.type === 'resume_history' && this.loadSessionResolve) {
      const record: SessionRecord = {
        id: message.sessionId,
        timestamp: Date.now(), // Will be overwritten if available from host
        preview: message.data?.messages?.[0]?.content?.substring(0, 40) + '...',
        customName: message.data?.customName,
        config: message.data?.config,
        data: message.data,
        isCloud: false
      };
      this.loadSessionResolve(record);
      this.loadSessionResolve = null;
    } else if (message.type === 'gems_loaded' && this.loadGemsResolve) {
      this.loadGemsResolve({
        gems: message.gems || [],
        defaultGemId: message.defaultGemId || 'gem-general'
      });
      this.loadGemsResolve = null;
    } else if (message.type === 'session_saved') {
       // Acknowledge save
       const pending = this.pendingRequests.get(message.sessionId);
       if (pending) {
         pending.resolve(message.sessionId);
         this.pendingRequests.delete(message.sessionId);
       }
    }
  }

  async init(): Promise<void> {
    this.ready = true;
    vscode.postMessage({ type: 'webview_ready' });
  }

  isReady(): boolean {
    return this.ready;
  }

  async saveSession(sessionId: string, data: any): Promise<string> {
    const id = sessionId || `session-${Date.now()}`;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      vscode.postMessage({
        type: 'save_active_session',
        sessionId: id,
        data: data
      });
      // Fallback resolution just in case host doesn't send ACK immediately
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
           this.pendingRequests.get(id)?.resolve(id);
           this.pendingRequests.delete(id);
        }
      }, 500);
    });
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    return new Promise((resolve) => {
      this.loadSessionsResolve = resolve;
      vscode.postMessage({ type: 'request_sessions' }); // We need to add this handler to extension.ts
    });
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    return new Promise((resolve) => {
      this.loadSessionResolve = resolve;
      vscode.postMessage({ type: 'load_specific_session', sessionId });
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    vscode.postMessage({ type: 'delete_session', sessionId });
    return Promise.resolve();
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    vscode.postMessage({ type: 'archive_session', sessionId, archive });
    return Promise.resolve();
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    vscode.postMessage({ type: 'rename_session', sessionId, newName });
    return Promise.resolve();
  }

  async clearAll(): Promise<void> {
    console.warn("clearAll not fully implemented for VSCodeStorageProvider");
    return Promise.resolve();
  }

  async saveGemsConfig(config: GemsConfig): Promise<void> {
    vscode.postMessage({ type: 'save_gems_config', data: config.gems, defaultGemId: config.defaultGemId });
    return Promise.resolve();
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    return new Promise((resolve) => {
      this.loadGemsResolve = resolve;
      // Host triggers this on 'webview_ready', but let's add an explicit request just in case
      vscode.postMessage({ type: 'request_gems' });
    });
  }
}
