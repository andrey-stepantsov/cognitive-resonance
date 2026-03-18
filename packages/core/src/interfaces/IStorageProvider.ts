// Re-using the SessionRecord type definition conceptually, but expanding it slightly
export interface SessionRecord {
  id: string;
  timestamp: number;
  preview: string;
  customName?: string;
  config?: any;
  data: any; // the actual message/node payload
  parentId?: string; // The session ID this branched from
  forkedAt?: number; // When the fork occurred
  isCloud?: boolean; // Useful for UI indicators
  isArchived?: boolean; // Indicates if the session is archived
  userId?: string; // The ID of the user who owns this session
}

export interface GemsConfig {
  [key: string]: any;
}

export interface IStorageProvider {
  /**
   * Identifier for the provider type ('local', 'cloud', 'mock')
   */
  readonly type: 'local' | 'cloud' | 'mock';

  /**
   * Optional initialization for the storage provider.
   */
  init?(): Promise<void>;

  /**
   * Validates if the provider is fully ready for reads/writes.
   */
  isReady(): boolean;

  /**
   * Creates or initializes a new session.
   * @param sessionId Session ID
   * @param config Optional configuration representing initial state (models, prompts)
   */
  createSession(sessionId: string, config?: any): Promise<void>;

  /**
   * Appends an atomic event to the session stream.
   * @param sessionId Session ID
   * @param type The distinct EventType (e.g. CHAT_MESSAGE)
   * @param payload The data payload for the event
   */
  appendEvent(sessionId: string, type: string, payload: any): Promise<void>;

  /**
   * Loads all available sessions.
   */
  loadAllSessions(): Promise<SessionRecord[]>;

  /**
   * Loads a specific session by ID.
   */
  loadSession(sessionId: string): Promise<SessionRecord | undefined>;

  /**
   * Deletes a specific session.
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * Renames a specific session.
   */
  renameSession(sessionId: string, newName: string): Promise<void>;

  /**
   * Clears all session data (used during migrations).
   */
  clearAll?(): Promise<void>;

  /**
   * Archives or unarchives a session.
   */
  archiveSession?(sessionId: string, archive: boolean): Promise<void>;

  // --- Gems config methods ---
  saveGemsConfig(config: GemsConfig): Promise<void>;
  loadGemsConfig(): Promise<GemsConfig | null>;

  /**
   * Clones a session into a specific divergent branch.
   */
  forkSession?(sessionId: string): Promise<string | undefined>;
}
