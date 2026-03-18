export type CommandAction =
  // Session Control
  | 'SESSION_CLEAR'
  | 'SESSION_NEW'
  | 'SESSION_LOAD'
  | 'SESSION_LS'
  | 'SESSION_ARCHIVE'
  | 'SESSION_RECOVER'
  | 'SESSION_CLONE'
  | 'SESSION_DELETE'
  | 'SESSION_RENAME'
  | 'SESSION_EXPORT'

  // Auth & Invites
  | 'LOGIN'
  | 'SIGNUP'
  | 'INVITE'

  // History
  | 'HISTORY'

  // Model & Gem Control
  | 'MODEL_USE'
  | 'GEM_USE'
  | 'GEM_LS'

  // Context
  | 'ATTACH'
  | 'CONTEXT_DROP'

  // Git
  | 'GIT_SYNC'
  | 'GIT_PUSH'
  | 'GIT_PULL'

  // Key Control
  | 'KEY_SET'
  | 'KEY_CLEAR'

  // Graph Interrogation
  | 'GRAPH_LS'
  | 'GRAPH_SEARCH'
  | 'GRAPH_DESCRIBE'
  | 'GRAPH_NEIGHBORS'
  | 'GRAPH_PATH'
  | 'GRAPH_DEPENDANTS'
  | 'GRAPH_STATS'
  | 'GRAPH_CLUSTER'
  | 'SEARCH'
  | 'SYSTEM'
  
  // Global Workspace
  | 'GLOBAL_SYNC'
  | 'GLOBAL_EDIT'
  
  // Fallback
  | 'UNKNOWN';

export const CommandAction = {
  SESSION_CLEAR: 'SESSION_CLEAR' as CommandAction,
  SESSION_NEW: 'SESSION_NEW' as CommandAction,
  SESSION_LOAD: 'SESSION_LOAD' as CommandAction,
  SESSION_LS: 'SESSION_LS' as CommandAction,
  SESSION_ARCHIVE: 'SESSION_ARCHIVE' as CommandAction,
  SESSION_RECOVER: 'SESSION_RECOVER' as CommandAction,
  SESSION_CLONE: 'SESSION_CLONE' as CommandAction,
  SESSION_DELETE: 'SESSION_DELETE' as CommandAction,
  SESSION_RENAME: 'SESSION_RENAME' as CommandAction,
  SESSION_EXPORT: 'SESSION_EXPORT' as CommandAction,
  LOGIN: 'LOGIN' as CommandAction,
  SIGNUP: 'SIGNUP' as CommandAction,
  INVITE: 'INVITE' as CommandAction,
  HISTORY: 'HISTORY' as CommandAction,
  MODEL_USE: 'MODEL_USE' as CommandAction,
  GEM_USE: 'GEM_USE' as CommandAction,
  GEM_LS: 'GEM_LS' as CommandAction,
  ATTACH: 'ATTACH' as CommandAction,
  CONTEXT_DROP: 'CONTEXT_DROP' as CommandAction,
  GIT_SYNC: 'GIT_SYNC' as CommandAction,
  GIT_PUSH: 'GIT_PUSH' as CommandAction,
  GIT_PULL: 'GIT_PULL' as CommandAction,
  KEY_SET: 'KEY_SET' as CommandAction,
  KEY_CLEAR: 'KEY_CLEAR' as CommandAction,
  GRAPH_LS: 'GRAPH_LS' as CommandAction,
  GRAPH_SEARCH: 'GRAPH_SEARCH' as CommandAction,
  GRAPH_DESCRIBE: 'GRAPH_DESCRIBE' as CommandAction,
  GRAPH_NEIGHBORS: 'GRAPH_NEIGHBORS' as CommandAction,
  GRAPH_PATH: 'GRAPH_PATH' as CommandAction,
  GRAPH_DEPENDANTS: 'GRAPH_DEPENDANTS' as CommandAction,
  GRAPH_STATS: 'GRAPH_STATS' as CommandAction,
  GRAPH_CLUSTER: 'GRAPH_CLUSTER' as CommandAction,
  SEARCH: 'SEARCH' as CommandAction,
  SYSTEM: 'SYSTEM' as CommandAction,
  GLOBAL_SYNC: 'GLOBAL_SYNC' as CommandAction,
  GLOBAL_EDIT: 'GLOBAL_EDIT' as CommandAction,
  UNKNOWN: 'UNKNOWN' as CommandAction,
};

export interface CommandIntent {
  action: CommandAction;
  args: string[];
  raw: string;
}

/**
 * Parses a raw string for @ mentions
 */
export function parseMentions(input: string): string[] {
  const mentions: string[] = [];
  const regex = /(^|\s)@([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    mentions.push(match[2].toLowerCase());
  }
  return mentions;
}

/**
 * Parses a raw REPL string into a structured CommandIntent.
 * Supports basic slash commands (e.g., "/session load 123", "/graph ls Node")
 * Returns null if the input is not a command.
 */
export function parseCommand(input: string): CommandIntent | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/') && !trimmed.startsWith('!')) {
    return null;
  }

  // Remove the trigger character
  const rawCommand = trimmed.slice(1);
  const parts = rawCommand.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { action: CommandAction.UNKNOWN, args: [], raw: input };
  }

  const namespace = parts[0].toLowerCase();
  const verb = parts[1]?.toLowerCase();
  const args = parts.slice(2);

  // Single namespace commands
  if (namespace === 'history') return { action: CommandAction.HISTORY, args: parts.slice(1), raw: input };
  if (namespace === 'clear') return { action: CommandAction.SESSION_CLEAR, args: parts.slice(1), raw: input };
  if (namespace === 'login') return { action: CommandAction.LOGIN, args: parts.slice(1), raw: input };
  if (namespace === 'signup') return { action: CommandAction.SIGNUP, args: parts.slice(1), raw: input };
  if (namespace === 'invite') return { action: CommandAction.INVITE, args: parts.slice(1), raw: input };
  if (namespace === 'sync') return { action: CommandAction.GIT_SYNC, args: parts.slice(1), raw: input };
  if (namespace === 'push') return { action: CommandAction.GIT_PUSH, args: parts.slice(1), raw: input };
  if (namespace === 'pull') return { action: CommandAction.GIT_PULL, args: parts.slice(1), raw: input };
  if (namespace === 'attach') return { action: CommandAction.ATTACH, args: parts.slice(1), raw: input };
  if (namespace === 'search') return { action: CommandAction.SEARCH, args: parts.slice(1), raw: input };
  if (namespace === 'system') return { action: CommandAction.SYSTEM, args: parts.slice(1), raw: input };

  // Compound commands
  if (namespace === 'session') {
    if (verb === 'new') return { action: CommandAction.SESSION_NEW, args, raw: input };
    if (verb === 'load') return { action: CommandAction.SESSION_LOAD, args, raw: input };
    if (verb === 'ls') return { action: CommandAction.SESSION_LS, args, raw: input };
    if (verb === 'archive') return { action: CommandAction.SESSION_ARCHIVE, args, raw: input };
    if (verb === 'recover') return { action: CommandAction.SESSION_RECOVER, args, raw: input };
    if (verb === 'clone') return { action: CommandAction.SESSION_CLONE, args, raw: input };
    if (verb === 'delete') return { action: CommandAction.SESSION_DELETE, args, raw: input };
    if (verb === 'rename') return { action: CommandAction.SESSION_RENAME, args, raw: input };
    if (verb === 'export') return { action: CommandAction.SESSION_EXPORT, args, raw: input };
  }

  if (namespace === 'model') {
    if (verb === 'use') return { action: CommandAction.MODEL_USE, args, raw: input };
  }

  if (namespace === 'gem') {
    if (verb === 'use') return { action: CommandAction.GEM_USE, args, raw: input };
    if (verb === 'ls') return { action: CommandAction.GEM_LS, args, raw: input };
  }

  if (namespace === 'context') {
    if (verb === 'drop') return { action: CommandAction.CONTEXT_DROP, args, raw: input };
  }

  if (namespace === 'git') {
    if (verb === 'sync') return { action: CommandAction.GIT_SYNC, args, raw: input };
    if (verb === 'push') return { action: CommandAction.GIT_PUSH, args, raw: input };
    if (verb === 'pull') return { action: CommandAction.GIT_PULL, args, raw: input };
  }

  if (namespace === 'key') {
    if (verb === 'set') return { action: CommandAction.KEY_SET, args, raw: input };
    if (verb === 'clear') return { action: CommandAction.KEY_CLEAR, args, raw: input };
  }

  if (namespace === 'graph') {
    if (verb === 'ls') return { action: CommandAction.GRAPH_LS, args, raw: input };
    if (verb === 'search') return { action: CommandAction.GRAPH_SEARCH, args, raw: input };
    if (verb === 'describe') return { action: CommandAction.GRAPH_DESCRIBE, args, raw: input };
    if (verb === 'neighbors') return { action: CommandAction.GRAPH_NEIGHBORS, args, raw: input };
    if (verb === 'path') return { action: CommandAction.GRAPH_PATH, args, raw: input };
    if (verb === 'dependants') return { action: CommandAction.GRAPH_DEPENDANTS, args, raw: input };
    if (verb === 'stats') return { action: CommandAction.GRAPH_STATS, args, raw: input };
    if (verb === 'cluster') return { action: CommandAction.GRAPH_CLUSTER, args, raw: input };
  }

  if (namespace === 'global') {
    if (verb === 'sync') return { action: CommandAction.GLOBAL_SYNC, args, raw: input };
    if (verb === 'edit') return { action: CommandAction.GLOBAL_EDIT, args, raw: input };
  }

  return { action: CommandAction.UNKNOWN, args: parts.slice(1), raw: input };
}
