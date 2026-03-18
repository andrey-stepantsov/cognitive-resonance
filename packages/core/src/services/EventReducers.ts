import type { IEvent } from '../interfaces/IEvents';
import type { SessionRecord } from '../interfaces/IStorageProvider';

export function reduceSessionState(events: IEvent[], sessionId: string): SessionRecord | undefined {
  if (!events || events.length === 0) return undefined;

  // If a delete event exists, the session is deleted
  if (events.some(e => e.type === 'PWA_DELETE')) return undefined;

  const state: SessionRecord = {
    id: sessionId,
    timestamp: 0,
    preview: 'Empty Session',
    config: {},
    data: { messages: [] },
    isCloud: false,
    isArchived: false,
  };

  let hasValidEvents = false;

  for (const evt of events) {
    // Specifically ignoring PWA_SNAPSHOT to abandon legacy sessions without atomic events
    // as per user's request.
    if (evt.type === 'PWA_SNAPSHOT') {
      continue;
    }

    hasValidEvents = true;

    if (evt.timestamp > state.timestamp) {
      state.timestamp = evt.timestamp;
    }

    try {
      const payload = JSON.parse(evt.payload || '{}');

      switch (evt.type) {
        case 'SESSION_CREATED':
          if (payload.config) {
            state.config = { ...state.config, ...payload.config };
            state.data.config = state.config;
          }
          break;
        case 'CHAT_MESSAGE':
          if (payload.message) {
            state.data.messages.push(payload.message);
          }
          break;
        case 'PWA_RENAME':
          state.customName = payload.customName;
          break;
        case 'PWA_ARCHIVE_TOGGLE':
          state.isArchived = payload.isArchived;
          break;
        case 'ARTEFACT_PROPOSED':
        case 'ARTEFACT_PROMOTED':
          // Reserved for future artefact state projection
          break;
        case 'ARTEFACT_DRAFT':
          state.data.messages.push({
            role: 'model',
            content: `[Remote Artefact] Draft proposed: ${payload.branch || 'unknown'} for ${payload.path}`
          });
          break;
      }
    } catch (e) {
      console.warn(`EventReducers: Failed to parse payload for event ${evt.type}`, e);
    }
  }

  // If the session only had a snapshot or unknown events, we ignore it as a legacy session
  if (!hasValidEvents) {
    return undefined;
  }

  // Generate the preview string
  if (state.data.messages.length > 0) {
    state.preview = state.data.messages[0].content.substring(0, 40) + '...';
  }

  return state;
}
