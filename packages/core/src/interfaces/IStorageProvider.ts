// Re-using the SessionRecord type definition conceptually, but expanding it slightly
export interface SessionRecord {
  id: string;
  timestamp: number;
  preview: string;
  customName?: string;
  config?: any;
  data: any;
  isCloud?: boolean; // Useful for UI indicators
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
   * Saves or updates a session.
   * @param sessionId Session ID, or empty string to create new
   * @param data Full session data object
   * @returns The saved session ID
   */
  saveSession(sessionId: string, data: any): Promise<string>;

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

  // --- Gems config methods ---
  saveGemsConfig(config: GemsConfig): Promise<void>;
  loadGemsConfig(): Promise<GemsConfig | null>;
}
