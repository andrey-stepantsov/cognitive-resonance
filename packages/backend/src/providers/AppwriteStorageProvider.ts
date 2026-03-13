import type { IStorageProvider, SessionRecord, GemsConfig } from '@cr/core/src/interfaces/IStorageProvider';
import { Client, Databases, ID, Query } from 'appwrite';
import { globalBackendConfig } from '../config';

export class AppwriteStorageProvider implements IStorageProvider {
  readonly type = 'cloud';
  private db: Databases;
  private client: Client;
  private dbId = '';
  private sessionsCollId = '';
  private ready = false;

  constructor() {
    this.client = new Client();
    this.db = new Databases(this.client);
  }

  private ensureConfigured(): boolean {
    if (this.dbId && this.sessionsCollId) return true;
    
    const endpoint = globalBackendConfig.endpoint;
    const project = globalBackendConfig.project;
    this.dbId = globalBackendConfig.dbId || '';
    this.sessionsCollId = globalBackendConfig.collectionId || '';

    if (endpoint) this.client.setEndpoint(endpoint);
    if (project) this.client.setProject(project);

    return !!this.dbId && !!this.sessionsCollId;
  }

  async init(): Promise<void> {
    if (!this.ensureConfigured()) {
      console.warn('AppwriteStorageProvider: Missing DB_ID or COLLECTION_ID env vars.');
    }
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async saveSession(sessionId: string, data: any): Promise<string> {
    this.ensureConfigured();
    const id = sessionId || ID.unique();
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
      isCloud: true,
      isArchived: data.isArchived || false
    };

    try {
      // Check if exists
      try {
        await this.db.getDocument(this.dbId, this.sessionsCollId, id);
        // Exists, update
        await this.db.updateDocument(this.dbId, this.sessionsCollId, id, {
          timestamp: record.timestamp,
          preview: record.preview,
          customName: record.customName || null,
          config: JSON.stringify(record.config || {}),
          data: JSON.stringify(record.data),
          isArchived: record.isArchived,
          isCloud: true
        });
      } catch (err: any) {
        if (err.code === 404) {
          // Create new
          await this.db.createDocument(this.dbId, this.sessionsCollId, id, {
            timestamp: record.timestamp,
            preview: record.preview,
            customName: record.customName || null,
            config: JSON.stringify(record.config || {}),
            data: JSON.stringify(record.data),
            isArchived: record.isArchived,
            isCloud: true
          });
        } else {
          throw err;
        }
      }
    } catch (error) {
       console.error('Failed to save session to Appwrite:', error);
       throw error;
    }
    
    return id;
  }

  async loadAllSessions(): Promise<SessionRecord[]> {
    if (!this.ensureConfigured()) return [];
    try {
      const response = await this.db.listDocuments(this.dbId, this.sessionsCollId, [
        Query.orderDesc('timestamp'),
        Query.limit(100)
      ]);
      return response.documents.map((doc: any) => this.mapDocumentToRecord(doc));
    } catch(err) {
      console.error('Failed to load sessions from Appwrite:', err);
      return [];
    }
  }

  async loadSession(sessionId: string): Promise<SessionRecord | undefined> {
    if (!this.ensureConfigured()) return undefined;
    try {
      const doc = await this.db.getDocument(this.dbId, this.sessionsCollId, sessionId);
      return this.mapDocumentToRecord(doc as any);
    } catch(err) {
      console.error(`Failed to load session ${sessionId} from Appwrite:`, err);
      return undefined;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.ensureConfigured()) return;
    try {
      await this.db.deleteDocument(this.dbId, this.sessionsCollId, sessionId);
    } catch (err) {
      console.error(`Failed to delete session ${sessionId} from Appwrite:`, err);
    }
  }

  async renameSession(sessionId: string, newName: string): Promise<void> {
    this.ensureConfigured();
    try {
      await this.db.updateDocument(this.dbId, this.sessionsCollId, sessionId, {
        customName: newName
      });
    } catch (err) {
      console.error(`Failed to rename session ${sessionId} in Appwrite:`, err);
    }
  }

  async archiveSession(sessionId: string, archive: boolean): Promise<void> {
    this.ensureConfigured();
    try {
      await this.db.updateDocument(this.dbId, this.sessionsCollId, sessionId, {
        isArchived: archive
      });
    } catch (err) {
      console.error(`Failed to archive session ${sessionId} in Appwrite:`, err);
    }
  }

  // Gems config storage not strictly required in cloud instantly or can be stored in user prefs
  async saveGemsConfig(_config: GemsConfig): Promise<void> {
    // No-op for now unless we add a UserPreferences collection
  }

  async loadGemsConfig(): Promise<GemsConfig | null> {
    return null;
  }

  private mapDocumentToRecord(doc: any): SessionRecord {
    return {
      id: doc.$id,
      timestamp: doc.timestamp,
      preview: doc.preview,
      customName: doc.customName,
      config: doc.config ? JSON.parse(doc.config) : undefined,
      data: doc.data ? JSON.parse(doc.data) : {},
      isCloud: true,
      isArchived: doc.isArchived
    };
  }
}
