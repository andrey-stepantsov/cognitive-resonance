import { useCognitiveResonance, type Message } from './useCognitiveResonance';
import { CommandAction, parseCommand } from '../services/CommandParser';
import { gitRemoteSync } from '@cr/backend';
import { GitContextManager } from '../services/GitContextManager';
import Fuse from 'fuse.js';
import { useState } from 'react';

export function useREPL() {
  const cr = useCognitiveResonance();
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [reverseSearchQuery, setReverseSearchQuery] = useState<string>('');

  const injectSystemMessage = (content: string) => {
    cr.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    const sysMsg: Message = { role: 'model', content: `[System]: ${content}`, isError: false };
    cr.setMessages(prev => [...prev, sysMsg]);
  };

  const executeCommand = async (inputStr: string, activeHistory: string[] = commandHistory) => {
    const currentInput = inputStr.trim();
    if (!currentInput) return;

    const intent = parseCommand(currentInput);

    if (!intent) {
      // If it's not a slash command, just dump it in the input so the user can send it to LLM manually
      cr.setInput(currentInput);
      return;
    }

    // Clear input box
    cr.setInput('');

    // Handle the slash command
    try {
      switch (intent.action) {
        case CommandAction.SESSION_CLEAR:
          cr.startNewSession();
          break;
        case CommandAction.HISTORY: {
          const combinedHistory = activeHistory;
          if (combinedHistory.length > 0) {
            // Find unique historical commands in order of most recent to oldest
            const uniqueHistory = Array.from(new Set([...combinedHistory].reverse()));
            const latestHistory = uniqueHistory.slice(0, 10);
            const historyOut = latestHistory.map((cmd, idx) => `${idx + 1}. ${cmd}`).join('\\n');
            injectSystemMessage(`Recent Command History:\\n${historyOut}`);
          } else {
            injectSystemMessage('No command history found in this session.');
          }
          break;
        }
        case CommandAction.SESSION_NEW:
          cr.startNewSession();
          break;
        case CommandAction.SESSION_LOAD:
        case CommandAction.SESSION_ARCHIVE:
        case CommandAction.SESSION_RECOVER:
        case CommandAction.SESSION_DELETE:
        case CommandAction.SESSION_RENAME: {
          const query = intent.args.join(' ').trim();
          if (query) {
            let targetSessionId = query;
            let targetCustomName = '';
            if (cr.sessions && cr.sessions.length > 0) {
               // Try to match the exact ID first
               const exactMatch = cr.sessions.find(s => s.id === query);
               if (exactMatch) {
                 targetSessionId = exactMatch.id;
                 targetCustomName = exactMatch.customName || exactMatch.preview;
               } else {
                 // Fuzzy search against customName or preview
                 const fuse = new Fuse(cr.sessions, { keys: ['customName', 'preview', 'id'], threshold: 0.4 });
                 const results = fuse.search(query);
                 if (results.length > 0) {
                   targetSessionId = results[0].item.id;
                   targetCustomName = results[0].item.customName || results[0].item.preview;
                 } else {
                   injectSystemMessage(`No session found matching '${query}'.`);
                   break;
                 }
               }
            }
            if (intent.action === CommandAction.SESSION_LOAD) {
               if (targetCustomName) injectSystemMessage(`Loading session: ${targetCustomName}`);
               await cr.handleLoadSession(targetSessionId);
            } else if (intent.action === CommandAction.SESSION_ARCHIVE) {
               cr.handleArchiveSession(targetSessionId, true, new Event('custom') as any);
               injectSystemMessage(`Archived session: ${targetCustomName || query}`);
            } else if (intent.action === CommandAction.SESSION_RECOVER) {
               cr.handleArchiveSession(targetSessionId, false, new Event('custom') as any);
               injectSystemMessage(`Recovered session: ${targetCustomName || query}`);
            } else if (intent.action === CommandAction.SESSION_DELETE) {
               cr.handleDeleteSession(targetSessionId, new Event('custom') as any);
               injectSystemMessage(`Permanently deleted session: ${targetCustomName || query}`);
            } else if (intent.action === CommandAction.SESSION_RENAME) {
               // Due to UI complexities, we'll cheat a bit and just reuse the existing submit handler 
               // by directly editing the item's customName property from CR layer if we could...
               // However, CR exposes `handleRenameSessionSubmit` requiring an Event and setting state.
               injectSystemMessage(`Renaming via CLI is partially supported. Opening UI editor for ${targetCustomName || query}...`);
               cr.startRenameSession(targetSessionId, targetCustomName || query, new Event('custom') as any);
            }
          } else {
            injectSystemMessage(`Please provide a session name or ID to ${intent.action.split('_')[1].toLowerCase()}.`);
          }
          break;
        }
        case CommandAction.SESSION_EXPORT:
          if (cr.messages.length > 0) {
            cr.handleDownloadHistory();
            injectSystemMessage('Exporting current session history...');
          } else {
            injectSystemMessage('Cannot export an empty session.');
          }
          break;
        case CommandAction.SESSION_LS:
          if (cr.sessions && cr.sessions.length > 0) {
            const outSessions = cr.sessions.map((s, idx) => `${idx + 1}. [${s.id}] ${s.customName || s.preview}`).join('\\n');
            injectSystemMessage(`Available Sessions:\\n${outSessions}`);
          } else {
            injectSystemMessage('No saved sessions found.');
          }
          break;
        case CommandAction.MODEL_USE:
          if (intent.args[0]) {
            cr.setSelectedModel(intent.args[0]);
            injectSystemMessage(`Switched model to ${intent.args[0]}`);
          }
          break;
        case CommandAction.GEM_USE:
          if (intent.args[0]) {
            cr.handleSelectGem(intent.args[0]);
            injectSystemMessage(`Switched gem to ${intent.args[0]}`);
          }
          break;
        case CommandAction.GEM_LS:
          cr.setIsGemSidebarOpen(true);
          injectSystemMessage('Opened gems list.');
          break;
        case CommandAction.GRAPH_STATS:
          if (cr.activeState?.semanticNodes) {
             const nodeCount = cr.activeState.semanticNodes.length;
             const edgeCount = cr.activeState.semanticEdges.length;
             injectSystemMessage(`Graph Stats:\nNodes: ${nodeCount}\nEdges: ${edgeCount}`);
          } else {
             injectSystemMessage('No semantic graph generated for this session yet.');
          }
          break;
        case CommandAction.GRAPH_LS:
        case CommandAction.GRAPH_SEARCH: {
          const isSearch = intent.action === CommandAction.GRAPH_SEARCH;
          if (cr.activeState?.semanticNodes && (isSearch ? intent.args.length > 0 : true)) {
             let query = intent.args.length > 0 ? intent.args.join(' ') : undefined;
             if (query && ((query.startsWith('"') && query.endsWith('"')) || (query.startsWith("'") && query.endsWith("'")))) {
               query = query.slice(1, -1);
             }
             
             let nodes = cr.activeState.semanticNodes;
             if (query) {
               let isRegex = false;
               let regex: RegExp | null = null;
               if (query.startsWith('/') && query.lastIndexOf('/') > 0) {
                 const lastSlashIndex = query.lastIndexOf('/');
                 const pattern = query.slice(1, lastSlashIndex);
                 const flags = query.slice(lastSlashIndex + 1);
                 try {
                   regex = new RegExp(pattern, flags);
                   isRegex = true;
                 } catch (e) { }
               }

               if (isRegex && regex) {
                 nodes = nodes.filter(n => regex!.test(n.label || '') || regex!.test(n.id));
               } else {
                 const fuse = new Fuse(nodes, { keys: ['label', 'id'], threshold: 0.4 });
                 nodes = fuse.search(query).map(res => res.item);
               }
             }
             
             const outNodes = nodes.map(n => `- ${n.id} (${n.label})`).join('\\n');
             if (isSearch) {
                 injectSystemMessage(`Search Results for '${query}':\\n${outNodes || 'None found.'}`);
             } else {
                 injectSystemMessage(`Semantic Nodes${query ? ` (filtered by '${query}')` : ''}:\\n${outNodes || 'None found.'}`);
             }
          } else {
             if (!cr.activeState?.semanticNodes && !isSearch) {
               injectSystemMessage('No semantic graph generated for this session yet.');
             } else {
               injectSystemMessage('Please provide a search query.');
             }
          }
          break;
        }
        case CommandAction.GRAPH_DESCRIBE:
          if (cr.activeState?.semanticNodes && intent.args[0]) {
            const nodeId = intent.args[0];
            const node = cr.activeState.semanticNodes.find(n => n.id === nodeId);
            if (node) {
               injectSystemMessage(`Node Description:\\nID: ${node.id}\\nLabel: ${node.label}\\nWeight: ${node.weight}`);
            } else {
               injectSystemMessage(`Node '${nodeId}' not found.`);
            }
          }
          break;
        case CommandAction.GRAPH_NEIGHBORS:
        case CommandAction.GRAPH_DEPENDANTS:
          if (cr.activeState?.semanticNodes && cr.activeState?.semanticEdges && intent.args[0]) {
            const nodeId = intent.args[0];
            const isDependants = intent.action === CommandAction.GRAPH_DEPENDANTS;
            const edges = cr.activeState.semanticEdges.filter(e => isDependants ? e.target === nodeId : (e.source === nodeId || e.target === nodeId));
            
            if (edges.length > 0) {
              const neighborNames = edges.map(e => `[${e.source}] --(${e.label})--> [${e.target}]`).join('\\n');
              injectSystemMessage(`${isDependants ? 'Dependants' : 'Neighbors'} of '${nodeId}':\\n${neighborNames}`);
            } else {
              injectSystemMessage(`No ${isDependants ? 'dependants' : 'neighbors'} found for '${nodeId}'.`);
            }
          }
          break;
        case CommandAction.GRAPH_PATH:
        case CommandAction.GRAPH_CLUSTER:
        case CommandAction.GRAPH_CLUSTER:
           injectSystemMessage(`Command not yet fully implemented for terminal rendering: ${intent.action}`);
           break;
        case CommandAction.ATTACH:
           injectSystemMessage(`Attached file: ${intent.args.join(' ')}`);
           break;
        case CommandAction.SEARCH: {
          const mode = intent.args[0]?.toLowerCase();
          if (mode === 'on') {
            cr.setIsSearchEnabled(true);
            injectSystemMessage('Google Search Grounding has been ENABLED for new messages.');
          } else if (mode === 'off') {
            cr.setIsSearchEnabled(false);
            injectSystemMessage('Google Search Grounding has been DISABLED.');
          } else {
            cr.setIsSearchEnabled(!cr.isSearchEnabled);
            injectSystemMessage(`Google Search Grounding is now ${!cr.isSearchEnabled ? 'ENABLED' : 'DISABLED'}.`);
          }
          break;
        }
        case CommandAction.SYSTEM: {
          const mode = intent.args[0]?.toLowerCase();
          if (mode === 'on') {
            cr.setShowSystemMessages(true);
            injectSystemMessage('System message visibility has been ENABLED.');
          } else if (mode === 'off') {
            cr.setShowSystemMessages(false);
            injectSystemMessage('System message visibility has been DISABLED.');
          } else {
            cr.setShowSystemMessages(!cr.showSystemMessages);
            injectSystemMessage(`System message visibility is now ${!cr.showSystemMessages ? 'ENABLED' : 'DISABLED'}.`);
          }
          break;
        }
        case CommandAction.CONTEXT_DROP:
           injectSystemMessage(`Dropped context for: ${intent.args.join(' ')}`);
           break;
        case CommandAction.GIT_SYNC:
        case CommandAction.GIT_PUSH: {
           const sessionId = cr.ensureActiveSession();
           injectSystemMessage('Pushing local virtual repository to Cloudflare Remote...');
           try {
             const git = new GitContextManager(sessionId);
             await git.initRepo(); // Ensure it exists locally
             
             if (!(await git.hasCommits())) {
               injectSystemMessage('Repository is empty. Creating initial commit...');
               await git.stageFile('VirtualContext.md', '# Initial Context\n');
               await git.commitChange('Initial repository state');
             }

             const currentBranch = await git.getCurrentBranch() || 'main';
             await gitRemoteSync.pushToRemote(git.fs, git.dir, currentBranch);
             injectSystemMessage('Successfully pushed packfile to Cloudflare! 🎉');
           } catch (err: any) {
             injectSystemMessage(`Failed to push to remote: ${err.message}`);
           }
           break;
        }
        case CommandAction.GIT_PULL: {
           const sessionId = cr.ensureActiveSession();
           injectSystemMessage('Pulling from Cloudflare Remote...');
           try {
             const git = new GitContextManager(sessionId);
             await git.initRepo(); // Ensure it exists locally
             
             const currentBranch = await git.getCurrentBranch() || 'main';
             await gitRemoteSync.pullFromRemote(git.fs, git.dir, currentBranch);
             injectSystemMessage('Successfully pulled from Cloudflare! 📥');
           } catch (err: any) {
             injectSystemMessage(`Failed to pull from remote: ${err.message}`);
           }
           break;
        }
        case CommandAction.GLOBAL_SYNC: {
           const sessionId = cr.ensureActiveSession();
           injectSystemMessage('Pushing global workspace repository to Cloudflare Remote...');
           try {
             const git = new GitContextManager(sessionId);
             await git.initGlobalRepo(); // Ensure it exists locally
             
             if (!(await git.hasGlobalCommits())) {
               injectSystemMessage('Global Repository is empty. Creating initial commit...');
               await git.stageGlobalFile('SystemPrompt.md', '# Global System Prompt\n');
               await git.commitGlobalChange('Initial global repository state');
             }

             const currentBranch = await git.getGlobalBranch() || 'main';
             await gitRemoteSync.pushToRemote(git.fs, git.globalDir, currentBranch);
             injectSystemMessage('Successfully pushed Global Workspace packfile! 🌍');
           } catch (err: any) {
             injectSystemMessage(`Failed to push to global remote: ${err.message}`);
           }
           break;
        }
        case CommandAction.GLOBAL_EDIT: {
           // For now, MVP toggles the Artifact Editor UI based on file selection, 
           // but we can at least log this. UI will need an explicit toggle switch or dropdown.
           injectSystemMessage(`Please toggle the "Global Workspace" tab in the Artifact Editor to edit: ${intent.args.join(' ') || 'files'}`);
           break;
        }
        case CommandAction.KEY_SET:
          if (intent.args[0]) {
            cr.handleSetApiKey(intent.args[0]);
            injectSystemMessage('API key set successfully.');
          } else {
            injectSystemMessage('Please provide an API key.');
          }
          break;
        case CommandAction.KEY_CLEAR:
          cr.handleClearApiKey();
          injectSystemMessage('API key cleared.');
          break;
        // Add other cases...
        case CommandAction.UNKNOWN:
        default:
           injectSystemMessage(`Unknown command: ${intent.raw}`);
           break;
      }
    } catch (err: any) {
      injectSystemMessage(`Error executing command: ${err.message}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === ' ' && cr.mentionSearchQuery !== null && cr.mentionSuggestions.length > 0) {
      e.preventDefault();
      cr.handleMentionSelect(
        cr.mentionSuggestions[0].name,
        cr.mentionSuggestions[0].raw,
        cr.mentionSuggestions[0].type
      );
      return;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIdx = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIdx);
        cr.setInput(commandHistory[commandHistory.length - 1 - nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        cr.setInput(commandHistory[commandHistory.length - 1 - nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        cr.setInput(''); 
      }
    } else if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      
      let query = cr.input;
      if (!query) return;

      if (historyIndex !== -1 && commandHistory[commandHistory.length - 1 - historyIndex] === cr.input && reverseSearchQuery) {
        query = reverseSearchQuery;
      } else {
        setReverseSearchQuery(query);
      }
      
      const startIdx = historyIndex >= 0 ? historyIndex + 1 : 0;
      const searchableHistory = commandHistory.slice(0, commandHistory.length - startIdx).map((cmd, idx) => ({
        historyIndex: commandHistory.length - 1 - idx,
        command: cmd
      }));

      // Find all matches using Fuse
      const fuse = new Fuse(searchableHistory, { 
        keys: ['command'], 
        threshold: 0.4, 
        ignoreLocation: true,
        findAllMatches: true,
        minMatchCharLength: 1
      });
      const results = fuse.search(query);

      if (results.length > 0) {
        // We want the most recent match (lowest historyIndex)
        results.sort((a, b) => a.item.historyIndex - b.item.historyIndex);
        const bestMatch = results[0].item;
        
        setHistoryIndex(bestMatch.historyIndex);
        cr.setInput(bestMatch.command);
        injectSystemMessage(`Reverse search: fuzzy matched '${query}' -> '${bestMatch.command}'`);
      } else {
        injectSystemMessage(`Reverse search: no older items matching '${query}'`);
      }
    }
  };

  const handleREPLSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentInput = cr.input.trim();
    if (!currentInput) return;

    const newHistory = [...commandHistory, currentInput];
    setCommandHistory(newHistory);
    setHistoryIndex(-1);

    const intent = parseCommand(currentInput);
    if (!intent) {
      return cr.handleSubmit(e);
    }

    cr.setInput('');
    await executeCommand(currentInput, newHistory);
  };

  return {
    ...cr,
    handleSubmit: handleREPLSubmit,
    handleKeyDown,
    executeCommand,
  };
}
