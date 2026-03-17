import type { IStorageProvider, SessionRecord, GemsConfig } from '@cr/core';

const MOCK_DB_NAME = 'cognitive-resonance-cloud-mock';
const DB_VERSION = 1;
const SESSIONS_STORE = 'cloud_sessions';
const MOCK_DELAY = 600; // Simulate network latency

function simulateNetwork<T>(task: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        resolve(await task());
      } catch (e) {
        reject(e);
      }
    }, MOCK_DELAY);
  });
}

function openMockDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MOCK_DB_NAME, DB_VERSION);
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

export class MockCloudStorageProvider implements IStorageProvider {
  readonly type = 'cloud';
  private ready = false;

  async init(): Promise<void> {
    try {
      await simulateNetwork(() => openMockDB());
      this.ready = true;
    } catch (e) {
      console.error("Failed to initialize Mock Cloud DB", e);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async saveSession(sessionId: string, data: any): Promise<string> {
    return simulateNetwork(async () => {
      const id = sessionId || `session-${Date.now()}`;
      const db = await openMockDB();
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
        isCloud: true // Mark as cloud
      };

      return new Promise<string>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        tx.objectStore(SESSIONS_STORE).put(record);
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    return simulateNetwork(async () => {
      const db = await openMockDB();
      return new Promise<SessionRecord[]>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readonly');
        const request = tx.objectStore(SESSIONS_STORE).getAll();
        request.onsuccess = () => {
          const sessions = (request.result as SessionRecord[])
            .sort((a, b) => b.timestamp - a.timestamp);
          resolve(sessions);
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    return simulateNetwork(async () => {
      const db = await openMockDB();
      return new Promise<SessionRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readonly');
        const request = tx.objectStore(SESSIONS_STORE).get(sessionId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return simulateNetwork(async () => {
      const db = await openMockDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        tx.objectStore(SESSIONS_STORE).delete(sessionId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    return simulateNetwork(async () => {
      const record = await this.loadSession(sessionId);
      if (!record) return;
      record.customName = newName;
      record.data.customName = newName;
      const db = await openMockDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        tx.objectStore(SESSIONS_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    return simulateNetwork(async () => {
      const record = await this.loadSession(sessionId);
      if (!record) return;
      record.isArchived = archive;
      record.data.isArchived = archive;
      const db = await openMockDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        tx.objectStore(SESSIONS_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  async forkSession(sessionId: string): Promise<string | undefined> {
    return simulateNetwork(async () => {
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
      const db = await openMockDB();
      return new Promise<string>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        tx.objectStore(SESSIONS_STORE).put(newRecord);
        tx.oncomplete = () => resolve(newId);
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  async clearAll(): Promise<void> {
    return simulateNetwork(async () => {
      const db = await openMockDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        tx.objectStore(SESSIONS_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  // Simple mock for gems config - assumes user scoped in a real cloud
  async saveGemsConfig(config: GemsConfig): Promise<void> {
    return simulateNetwork(() => {
      localStorage.setItem('cloud-mock-gems-config', JSON.stringify(config));
    });
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    return simulateNetwork(() => {
      try {
        const raw = localStorage.getItem('cloud-mock-gems-config');
        if (raw) {
          return JSON.parse(raw);
        }
      } catch { }
      return null;
    });
  }
}
