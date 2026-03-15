/**
 * SearchService — Semantic search across sessions.
 * Prefers cloud search via Cloudflare Vectorize when configured,
 * falls back to client-side Fuse.js fuzzy search.
 */

import Fuse from 'fuse.js';
import type { IStorageProvider } from '../interfaces/IStorageProvider';

export interface SearchResult {
  sessionId: string;
  sessionPreview: string;
  timestamp: number;
  turnIndex: number;
  contextSnippet: string;
  matchedConcepts: string[];
  score?: number;
}

/**
 * Search session history.
 * @param query - Search query string
 * @param storage - Storage provider for local fallback
 * @param cloudUrl - Optional Worker URL for cloud semantic search
 * @param apiKey - Optional API key for cloud search authentication
 */
export async function searchHistory(
  query: string,
  storage: IStorageProvider,
  cloudUrl?: string,
  apiKey?: string,
): Promise<SearchResult[]> {
  if (!query || query.trim() === '') return [];

  // Cloud path: use Vectorize semantic search when configured
  if (cloudUrl && apiKey) {
    try {
      const results = await cloudSearch(query, cloudUrl, apiKey);
      if (results.length > 0) return results;
    } catch {
      // Fall through to local search
    }
  }

  // Local fallback: Fuse.js fuzzy search
  return localFuseSearch(query, storage);
}

/**
 * Queries the Worker's /api/search endpoint for semantic results.
 */
export async function cloudSearch(
  query: string,
  cloudUrl: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const url = `${cloudUrl.replace(/\/$/, '')}/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) return [];

  const { results } = await res.json() as { results: any[] };
  if (!results?.length) return [];

  return results.map((r: any) => ({
    sessionId: r.sessionId,
    sessionPreview: r.preview || '',
    timestamp: r.timestamp || 0,
    turnIndex: 0,
    contextSnippet: r.preview || '',
    matchedConcepts: [],
    score: r.score,
  }));
}

/**
 * Falls back to client-side Fuse.js fuzzy search across local sessions.
 */
export async function localFuseSearch(
  query: string,
  storage: IStorageProvider,
): Promise<SearchResult[]> {
  const sessions = await storage.loadAllSessions();
  const searchableItems: any[] = [];

  for (const session of sessions) {
    if (session.isArchived) continue;

    const messages = session.data?.messages;
    if (!messages || !Array.isArray(messages)) continue;

    messages.forEach((msg: any, idx: number) => {
      if (
        msg.role === 'model' &&
        msg.internalState &&
        msg.internalState.semanticNodes &&
        msg.internalState.semanticNodes.length > 0
      ) {
        const nodes = msg.internalState.semanticNodes.map((n: any) => n.label || n.id);
        searchableItems.push({
          sessionId: session.id,
          sessionPreview: session.preview,
          timestamp: session.timestamp,
          turnIndex: idx,
          contextSnippet: msg.content.substring(0, 80) + '...',
          nodes,
        });
      }
    });
  }

  const fuse = new Fuse(searchableItems, {
    keys: ['nodes'],
    threshold: 0.3,
    ignoreLocation: true,
    includeMatches: true,
  });

  const rawResults = fuse.search(query);

  return rawResults.map((result: any) => {
    let matchedConcepts: string[] = [];
    if (result.matches) {
      result.matches.forEach((match: any) => {
        if (match.key === 'nodes') {
          matchedConcepts.push(match.value as string);
        }
      });
    }

    return {
      sessionId: result.item.sessionId,
      sessionPreview: result.item.sessionPreview,
      timestamp: result.item.timestamp,
      turnIndex: result.item.turnIndex,
      contextSnippet: result.item.contextSnippet,
      matchedConcepts: Array.from(new Set(matchedConcepts)),
    };
  });
}
