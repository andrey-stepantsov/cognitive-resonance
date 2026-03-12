import { useCognitiveResonance, type Message } from './useCognitiveResonance';
import { CommandAction, parseCommand } from '../services/CommandParser';

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
        case CommandAction.SESSION_LOAD:
          if (intent.args[0]) {
            await cr.handleLoadSession(intent.args[0]);
          }
          break;
        case CommandAction.SESSION_LS:
          cr.setIsHistorySidebarOpen(true);
          injectSystemMessage('Opened sessions list.');
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
          if (cr.activeState?.semanticNodes) {
             const typeFilter = intent.args.length > 0 ? intent.args.join(' ').toLowerCase() : undefined;
             let nodes = cr.activeState.semanticNodes;
             if (typeFilter) {
               // Assuming a heuristic where label casing or an explicit 'type' field might exist.
               // For now just substring search on label
               nodes = nodes.filter(n => (n.label || '').toLowerCase().includes(typeFilter));
             }
             const outNodes = nodes.map(n => `- ${n.id} (${n.label})`).join('\\n');
             injectSystemMessage(`Semantic Nodes${typeFilter ? ` (filtered by '${typeFilter}')` : ''}:\\n${outNodes || 'None found.'}`);
          } else {
             injectSystemMessage('No semantic graph generated for this session yet.');
          }
          break;
        case CommandAction.GRAPH_SEARCH:
          if (cr.activeState?.semanticNodes && intent.args.length > 0) {
             const query = intent.args.join(' ').toLowerCase();
             const nodes = cr.activeState.semanticNodes.filter(n => (n.label || '').toLowerCase().includes(query) || n.id.toLowerCase().includes(query));
             const outNodes = nodes.map(n => `- ${n.id} (${n.label})`).join('\\n');
             injectSystemMessage(`Search Results for '${query}':\\n${outNodes || 'None found.'}`);
          } else {
             injectSystemMessage('Please provide a search query.');
          }
          break;
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
