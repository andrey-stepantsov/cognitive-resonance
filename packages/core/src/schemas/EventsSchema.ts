import { z } from 'zod';
import type { IEvent } from '../interfaces/IEvents';

export const EventTypeSchema = z.enum([
  'SESSION_CREATED',
  'CHAT_MESSAGE',
  'ARTEFACT_PROPOSED',
  'ARTEFACT_PROMOTED',
  'PWA_RENAME',
  'PWA_ARCHIVE_TOGGLE',
  'PWA_DELETE',
  'PWA_SNAPSHOT',
  'ARTEFACT_PROPOSAL',
  'ARTEFACT_KEYFRAME',
  'PROJECT_CONFIG',
  'ENVIRONMENT_JOINED',
  'PRESENCE_UPDATE',
  'EXECUTION_REQUESTED',
  'RUNTIME_OUTPUT',
  'TERMINAL_SPAWN',
  'TERMINAL_INPUT',
  'TERMINAL_OUTPUT',
  'MANUAL_OVERRIDE',
  'MERGE_CONFLICT'
]);

export const SessionCreatedPayloadSchema = z.object({
  config: z.object({
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    gemId: z.string().optional()
  }).optional()
}).passthrough();

export const NodeSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  weight: z.number().optional()
}).passthrough();

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional()
}).passthrough();

export const InternalStateSchema = z.object({
  dissonanceScore: z.number().optional(),
  dissonanceReason: z.string().optional(),
  semanticNodes: z.array(NodeSchema).optional(),
  semanticEdges: z.array(EdgeSchema).optional(),
  tokenUsage: z.object({
    totalTokenCount: z.number().optional(),
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional()
  }).optional()
}).passthrough();

export const MessageSchema = z.object({
  role: z.enum(['user', 'model', 'peer']),
  content: z.string(),
  internalState: InternalStateSchema.optional(),
  modelTurnIndex: z.number().optional(),
  isError: z.boolean().optional(),
  senderId: z.string().optional(),
  senderName: z.string().optional()
}).passthrough();

export const ChatMessagePayloadSchema = z.object({
  message: MessageSchema
}).passthrough();

export const RenamePayloadSchema = z.object({
  customName: z.string()
}).passthrough();

export const ArchivePayloadSchema = z.object({
  isArchived: z.boolean()
}).passthrough();

export const ArtefactProposalPayloadSchema = z.object({
  path: z.string(),
  patch: z.string().optional(),
  isFullReplacement: z.boolean().optional()
}).passthrough();

export const ArtefactKeyframePayloadSchema = z.object({
  files: z.record(z.string(), z.string())
}).passthrough();

export const ProjectConfigPayloadSchema = z.object({
  projectId: z.string(),
  basePath: z.string(),
  dependencies: z.array(z.string()).optional()
}).passthrough();

export const ExecutionRequestedPayloadSchema = z.object({
  target: z.string().optional(),
  command: z.string().optional()
}).passthrough();

export const RuntimeOutputPayloadSchema = z.object({
  text: z.string().optional(),
  url: z.string().optional()
}).passthrough();

export const TerminalSpawnPayloadSchema = z.object({
  target: z.string().optional()
}).passthrough();

export const TerminalInputPayloadSchema = z.object({
  target: z.string().optional(),
  input: z.string().optional()
}).passthrough();

export const TerminalOutputPayloadSchema = z.object({
  text: z.string().optional()
}).passthrough();

export const EnvironmentJoinedPayloadSchema = z.object({
  host: z.string(),
  capabilities: z.record(z.string(), z.any()).optional()
}).passthrough();

export const MergeConflictPayloadSchema = z.object({
  conflicting_event_id: z.string()
}).passthrough();

const parsePayloadObj = (schema: z.ZodTypeAny, payloadObj: any, type: string) => {
  try {
    return schema.parse(payloadObj);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      throw new Error(`Validation Error in payload for event type ${type}: ${e.message}`);
    }
    throw e;
  }
};

/**
 * Top level schema for verifying event payload structure.
 * Validates the envelope and parses the payload JSON string, executing
 * the correct payload schema depending on event type.
 */
export const EventEnvelopeSchema = z.object({
  id: z.string().optional(),
  event_id: z.string().optional(),
  session_id: z.string(),
  timestamp: z.number(),
  actor: z.string().optional(),
  type: z.union([EventTypeSchema, z.string()]),
  payload: z.union([z.string(), z.record(z.string(), z.any())]),
  previous_event_id: z.string().nullable().optional(),
  sync_status: z.string().optional()
}).superRefine((data, ctx) => {
  let payloadObj: any;
  if (typeof data.payload === 'string') {
    try {
      payloadObj = JSON.parse(data.payload);
    } catch(e) {
      ctx.addIssue({ 
        code: z.ZodIssueCode.custom, 
        message: `Invalid JSON in payload for event type ${data.type}` 
      });
      return;
    }
  } else {
    payloadObj = data.payload;
  }

  try {
    switch (data.type) {
      case 'SESSION_CREATED': parsePayloadObj(SessionCreatedPayloadSchema, payloadObj, data.type); break;
      case 'CHAT_MESSAGE': parsePayloadObj(ChatMessagePayloadSchema, payloadObj, data.type); break;
      case 'PWA_RENAME': parsePayloadObj(RenamePayloadSchema, payloadObj, data.type); break;
      case 'PWA_ARCHIVE_TOGGLE': parsePayloadObj(ArchivePayloadSchema, payloadObj, data.type); break;
      case 'ARTEFACT_PROPOSAL': 
      case 'ARTEFACT_PROPOSED': 
      case 'ARTEFACT_PROMOTED': parsePayloadObj(ArtefactProposalPayloadSchema, payloadObj, data.type); break;
      case 'ARTEFACT_KEYFRAME': parsePayloadObj(ArtefactKeyframePayloadSchema, payloadObj, data.type); break;
      case 'PROJECT_CONFIG': parsePayloadObj(ProjectConfigPayloadSchema, payloadObj, data.type); break;
      case 'EXECUTION_REQUESTED': parsePayloadObj(ExecutionRequestedPayloadSchema, payloadObj, data.type); break;
      case 'RUNTIME_OUTPUT': parsePayloadObj(RuntimeOutputPayloadSchema, payloadObj, data.type); break;
      case 'TERMINAL_SPAWN': parsePayloadObj(TerminalSpawnPayloadSchema, payloadObj, data.type); break;
      case 'TERMINAL_INPUT': parsePayloadObj(TerminalInputPayloadSchema, payloadObj, data.type); break;
      case 'TERMINAL_OUTPUT': parsePayloadObj(TerminalOutputPayloadSchema, payloadObj, data.type); break;
      case 'ENVIRONMENT_JOINED': parsePayloadObj(EnvironmentJoinedPayloadSchema, payloadObj, data.type); break;
      case 'MERGE_CONFLICT': parsePayloadObj(MergeConflictPayloadSchema, payloadObj, data.type); break;
      // manual override often takes arbitrary JSON, wait until strictly typed
    }
  } catch (err: any) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err.message
    });
  }
});

/**
 * Ensures an incoming unknown event conforms exactly to the known Event signatures 
 * and structurally matches its type's payload requirements.
 * Throws ZodError if invalid.
 */
export function validateEventSequence(rawEvent: unknown) {
  return EventEnvelopeSchema.parse(rawEvent) as IEvent;
}
