/**
 * SearchService — Client-side fuzzy search across sessions.
 * Replaces the extension host's Fuse.js search (which ran in Node).
 */

import Fuse from 'fuse.js';
import { loadAllSessions, type SessionRecord } from './StorageService';

export interface SearchResult {
  sessionId: string;
  sessionPreview: string;
  timestamp: number;
  turnIndex: number;
  contextSnippet: string;
  matchedConcepts: string[];
}

export async function searchHistory(query: string): Promise<SearchResult[]> {
  if (!query || query.trim() === '') return [];

  const sessions = await loadAllSessions();
  const searchableItems: any[] = [];

  for (const session of sessions) {
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

  return rawResults.map((result) => {
    let matchedConcepts: string[] = [];
    if (result.matches) {
      result.matches.forEach((match) => {
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
