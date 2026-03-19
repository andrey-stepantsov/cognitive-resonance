import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DatabaseEngine } from "../db/DatabaseEngine";

/**
 * Exposes the Multi-Repo taxonomy tools natively to the AI via MCP.
 */
export class CognitiveMCPServer {
  private server: Server;

  constructor(private db: DatabaseEngine, private sessionId: string) {
    this.server = new Server(
      {
        name: "cognitive-resonance-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupRequestHandlers();
  }

  private setupRequestHandlers() {
    // List available capabilities
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "registerProject",
            description: "Registers a new project or module in the taxonomy",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                basePath: { type: "string" }
              },
              required: ["projectId", "basePath"],
            },
          },
          {
            name: "updateProjectDependencies",
            description: "Updates the dependencies of an existing project",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                basePath: { type: "string" },
                dependencies: { type: "array", items: { type: "string" } },
              },
              required: ["projectId", "basePath", "dependencies"],
            },
          },
          {
            name: "send_terminal_input",
            description: "Send an interactive string (like a command or prompt response) to a stateful PTY on a host",
            inputSchema: {
              type: "object",
              properties: {
                targetHost: { type: "string", description: "The node name or 'all'" },
                inputString: { type: "string", description: "The text to inject into the terminal, usually ending in \\n" },
              },
              required: ["targetHost", "inputString"],
            },
          },
          {
            name: "read_terminal_output",
            description: "Read the recent output buffer from a host's PTY",
            inputSchema: {
              type: "object",
              properties: {
                targetHost: { type: "string" },
                limit: { type: "number", description: "Max number of recent events to read (default 50)" }
              },
              required: ["targetHost"],
            },
          },
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "registerProject" || request.params.name === "updateProjectDependencies") {
        const payload = request.params.arguments;
        
        if (!payload || typeof payload !== 'object') return { toolResult: "Invalid arguments" };
        
        const projectId = (payload as any).projectId;
        const basePath = (payload as any).basePath;
        const dependencies = (payload as any).dependencies;

        try {
          const lastEventRow = this.db.get('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [this.sessionId]);
          const eventId = this.db.appendEvent({
            session_id: this.sessionId,
            timestamp: Date.now(),
            actor: 'SYSTEM',
            type: 'PROJECT_CONFIG',
            payload: JSON.stringify({ projectId, basePath, dependencies: dependencies || [] }),
            previous_event_id: lastEventRow ? lastEventRow.id : null
          });

          return { content: [{ type: "text", text: `Successfully injected PROJECT_CONFIG event into stream. Event ID: ${eventId}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error applying config: ${err.message}` }], isError: true };
        }
      }

      if (request.params.name === "send_terminal_input") {
        const payload = request.params.arguments;
        if (!payload || typeof payload !== 'object') return { toolResult: "Invalid arguments" };
        try {
           const lastEventRow = this.db.get('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [this.sessionId]);
           const eventId = this.db.appendEvent({
               session_id: this.sessionId,
               timestamp: Date.now(),
               actor: 'Agent',
               type: 'TERMINAL_INPUT',
               payload: JSON.stringify({ target: (payload as any).targetHost, input: (payload as any).inputString }),
               previous_event_id: lastEventRow ? lastEventRow.id : null
           });
           
           return { content: [{ type: "text", text: `Terminal Input sent via Event ID: ${eventId}` }] };
        } catch (err: any) {
           return { content: [{ type: "text", text: `Error sending terminal input: ${err.message}` }], isError: true };
        }
      }

      if (request.params.name === "read_terminal_output") {
         const payload = request.params.arguments;
         if (!payload || typeof payload !== 'object') return { toolResult: "Invalid arguments" };
         
         const targetHost = (payload as any).targetHost;
         const limit = (payload as any).limit || 50;
         
         const events = this.db.query(
             'SELECT payload, timestamp FROM events WHERE session_id = ? AND type = ? AND actor = ? ORDER BY timestamp DESC LIMIT ?', 
             [this.sessionId, 'TERMINAL_OUTPUT', targetHost, limit]
         ) as any[];
         
         // Outputs are returned descending by timestamp, reverse them to be chronological 
         events.reverse();
         const bufferedText = events.map(e => {
             const parsed = JSON.parse(e.payload);
             return parsed.text || '';
         }).join('');
         
         return {
             content: [{ type: "text", text: bufferedText || '(No terminal output found for host)' }]
         };
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Cognitive Resonance MCP Server running on stdio");
  }
}
