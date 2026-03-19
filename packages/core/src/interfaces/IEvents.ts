import type { Message } from '../hooks/useCognitiveResonance';

export type EventType = 
  | 'SESSION_CREATED'
  | 'CHAT_MESSAGE'
  | 'ARTEFACT_PROPOSED'
  | 'ARTEFACT_PROMOTED'
  | 'PWA_RENAME'
  | 'PWA_ARCHIVE_TOGGLE'
  | 'PWA_DELETE'
  | 'PWA_SNAPSHOT' // Kept in type enum, but skipped in reducers based on user request
  | 'ARTEFACT_PROPOSAL'
  | 'ARTEFACT_KEYFRAME'
  | 'PROJECT_CONFIG'
  | 'ENVIRONMENT_JOINED'
  | 'PRESENCE_UPDATE'
  | 'EXECUTION_REQUESTED'
  | 'RUNTIME_OUTPUT'
  | 'TERMINAL_SPAWN'
  | 'TERMINAL_INPUT'
  | 'TERMINAL_OUTPUT';

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

export interface ArtefactProposalPayload {
  path: string;
  patch: string; // The unified diff patch or full file content
  isFullReplacement?: boolean;
}

export interface ArtefactKeyframePayload {
  files: Record<string, string>; // path -> content map representing full snapshot
}

export interface ProjectConfigPayload {
  projectId: string;
  basePath: string; // e.g. "packages/core"
  dependencies?: string[];
}
