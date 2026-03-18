import type { Message } from '../hooks/useCognitiveResonance';

export type EventType = 
  | 'SESSION_CREATED'
  | 'CHAT_MESSAGE'
  | 'ARTEFACT_PROPOSED'
  | 'ARTEFACT_PROMOTED'
  | 'PWA_RENAME'
  | 'PWA_ARCHIVE_TOGGLE'
  | 'PWA_DELETE'
  | 'PWA_SNAPSHOT'; // Kept in type enum, but skipped in reducers based on user request

export interface IEvent {
  event_id?: string;
  session_id: string;
  timestamp: number;
  actor: string;
  type: EventType | string;
  payload: string; // JSON string representation
  previous_event_id: string | null;
}

export interface SessionCreatedPayload {
  config?: {
    model?: string;
    systemPrompt?: string;
    gemId?: string;
  };
}

export interface ChatMessagePayload {
  message: Message;
}

export interface RenamePayload {
  customName: string;
}

export interface ArchivePayload {
  isArchived: boolean;
}
