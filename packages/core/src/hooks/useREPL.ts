import { useCognitiveResonance, type Message } from './useCognitiveResonance';
import { CommandAction, parseCommand } from '../services/CommandParser';
import Fuse from 'fuse.js';

export function useREPL() {
  const cr = useCognitiveResonance();

  const injectSystemMessage = (content: string) => {
    cr.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    const sysMsg: Message = { role: 'model', content: `[System]: ${content}`, isError: false };
    cr.setMessages(prev => [...prev, sysMsg]);
  };

  const executeCommand = async (inputStr: string) => {
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
          // Simulate clear by resetting messages. (Requires setMessages exposed, or we handle it via a new session)
          cr.startNewSession();
          break;
        case CommandAction.SESSION_NEW:
          cr.startNewSession();
          break;
        case CommandAction.SESSION_LOAD: {
          const query = intent.args.join(' ').trim();
          if (query) {
            let targetSessionId = query;
            if (cr.sessions && cr.sessions.length > 0) {
               // Try to match the exact ID first
               const exactMatch = cr.sessions.find(s => s.id === query);
               if (exactMatch) {
                 targetSessionId = exactMatch.id;
               } else {
                 // Fuzzy search against customName or preview
                 const fuse = new Fuse(cr.sessions, { keys: ['customName', 'preview', 'id'], threshold: 0.4 });
                 const results = fuse.search(query);
                 if (results.length > 0) {
                   targetSessionId = results[0].item.id;
                   injectSystemMessage(`Fuzzy matched session: ${results[0].item.customName || results[0].item.preview}`);
                 } else {
                   injectSystemMessage(`No session found matching '${query}'.`);
                   break;
                 }
               }
            }
            await cr.handleLoadSession(targetSessionId);
          } else {
            injectSystemMessage('Please provide a session name or ID to load.');
          }
          break;
        }
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
        case CommandAction.CONTEXT_DROP:
           injectSystemMessage(`Dropped context for: ${intent.args.join(' ')}`);
           break;
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

  const handleREPLSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentInput = cr.input.trim();
    if (!currentInput) return;

    const intent = parseCommand(currentInput);
    if (!intent) {
      return cr.handleSubmit(e);
    }
    
    await executeCommand(currentInput);
  };

  return {
    ...cr,
    handleSubmit: handleREPLSubmit,
    executeCommand,
  };
}
