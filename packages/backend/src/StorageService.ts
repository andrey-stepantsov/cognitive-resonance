/**
 * StorageService — IndexedDB-backed storage for sessions and gems.
 * Replaces the VS Code extension host's filesystem operations.
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'cognitive-resonance';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const GEMS_KEY = 'cognitive-resonance-gems-config';
const API_KEY_KEY = 'cognitive-resonance-api-key';

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

export interface SessionRecord {
  id: string;
  timestamp: number;
  preview: string;
  customName?: string;
  config?: any;
  data: any;
  isArchived?: boolean;
}

// ── Sessions ──────────────────────────────────────────────────

export async function saveSession(sessionId: string, data: any): Promise<string> {
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
    isArchived: data.isArchived || false
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).put(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllSessions(): Promise<SessionRecord[]> {
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

export async function loadSession(sessionId: string): Promise<SessionRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const request = tx.objectStore(SESSIONS_STORE).get(sessionId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).delete(sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameSession(sessionId: string, newName: string): Promise<void> {
  const record = await loadSession(sessionId);
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

// ── Gems Config ───────────────────────────────────────────────

export function saveGemsConfig(gems: any[], defaultGemId: string): void {
  localStorage.setItem(GEMS_KEY, JSON.stringify({ gems, defaultGemId }));
}

export function loadGemsConfig(): { gems: any[]; defaultGemId: string } {
  try {
    const raw = localStorage.getItem(GEMS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { gems: data.gems || [], defaultGemId: data.defaultGemId || 'gem-general' };
    }
  } catch { }
  return { gems: [], defaultGemId: 'gem-general' };
}

// ── API Key ───────────────────────────────────────────────────

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key);
}

export function loadApiKey(): string | null {
  return localStorage.getItem(API_KEY_KEY);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_KEY);
}

// ── File Download (replaces VS Code save dialog) ─────────────

export function downloadJSON(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Native Mobile Sharing ────────────────────────────────────

export async function shareJSON(data: any, filename: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  
  try {
    const jsonString = JSON.stringify(data, null, 2);
    
    // For small payloads, share as text directly — avoids FileProvider entirely.
    if (jsonString.length < 100 * 1024) {
      try {
        await Share.share({
          title: 'Cognitive Resonance Session',
          text: jsonString,
          dialogTitle: `Share ${filename}`,
        });
      } catch {
        // User cancelled — that's fine
      }
      return true;
    }
    
    // For larger payloads, write to file in chunks, then share via file URI.
    const CHUNK_SIZE = 250 * 1024;
    
    let currentChunk = jsonString.substring(0, CHUNK_SIZE);
    await Filesystem.writeFile({
      path: filename,
      data: currentChunk,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    
    for (let i = CHUNK_SIZE; i < jsonString.length; i += CHUNK_SIZE) {
      currentChunk = jsonString.substring(i, i + CHUNK_SIZE);
      await Filesystem.appendFile({
        path: filename,
        data: currentChunk,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
    }

    // Use getUri() to get a properly resolved file:// URI for the written file.
    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: 'Cognitive Resonance Session',
        url: uriResult.uri,
        dialogTitle: `Share ${filename}`,
      });
    } catch {
      // User cancelled or share sheet issue — not a fatal error
    }
    
    return true;
  } catch (error) {
    console.error('Error in shareJSON:', error);
    return false;
  }
}

