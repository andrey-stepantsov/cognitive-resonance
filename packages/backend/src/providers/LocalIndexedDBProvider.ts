import type { IStorageProvider, SessionRecord, GemsConfig } from '@cr/core';

const DB_NAME = 'cognitive-resonance';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const GEMS_KEY = 'cognitive-resonance-gems-config';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
    };
  });
}

export class LocalIndexedDBProvider implements IStorageProvider {
  readonly type = 'local';
  private ready = false;

  async init(): Promise<void> {
    try {
      await openDB();
      this.ready = true;
    } catch (e) {
      console.error("Failed to initialize IndexedDB", e);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async saveSession(sessionId: string, data: any): Promise<string> {
    const id = sessionId || `session-${Date.now()}`;
    const db = await openDB();
    const preview = data.messages?.length > 0
      ? (data.messages[0].content.substring(0, 40) + '...')
      : 'Empty Session';

    const record: SessionRecord = {
      id,
      timestamp: Date.now(),
      preview,
      customName: data.customName,
      config: data.config,
      data,
      isCloud: false
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).put(record);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const request = tx.objectStore(SESSIONS_STORE).getAll();
      request.onsuccess = () => {
        const sessions = (request.result as SessionRecord[])
          .sort((a, b) => b.timestamp - a.timestamp);
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const request = tx.objectStore(SESSIONS_STORE).get(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    const record = await this.loadSession(sessionId);
    if (!record) return;
    record.customName = newName;
    record.data.customName = newName;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    const record = await this.loadSession(sessionId);
    if (!record) return;
    record.isArchived = archive;
    record.data.isArchived = archive;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async forkSession(sessionId: string): Promise<string | undefined> {
    const record = await this.loadSession(sessionId);
    if (!record) return undefined;
    const newId = `session-${Date.now()}`;
    const newRecord: SessionRecord = {
      ...record,
      id: newId,
      timestamp: Date.now(),
      forkedAt: Date.now(),
      parentId: sessionId,
      data: {
        ...record.data,
        id: newId,
        timestamp: Date.now(),
      }
    };
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).put(newRecord);
      tx.oncomplete = () => resolve(newId);
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      tx.objectStore(SESSIONS_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveGemsConfig(config: GemsConfig): Promise<void> {
    localStorage.setItem(GEMS_KEY, JSON.stringify(config));
    return Promise.resolve();
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    try {
      const raw = localStorage.getItem(GEMS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch { }
    return Promise.resolve(null);
  }
}
