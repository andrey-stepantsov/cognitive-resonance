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
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "registerProject" || request.params.name === "updateProjectDependencies") {
        const payload = request.params.arguments;
        
        // Ensure required fields are present
        if (!payload || typeof payload !== 'object') {
           return { toolResult: "Invalid arguments" };
        }
        
        const projectId = (payload as any).projectId;
        const basePath = (payload as any).basePath;
        const dependencies = (payload as any).dependencies;

        try {
          // Find the last event ID for this session
          const lastEventRow = this.db.get('SELECT id FROM events WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1', [this.sessionId]);
          const lastEventId = lastEventRow ? lastEventRow.id : null;

          const eventId = this.db.appendEvent({
            session_id: this.sessionId,
            timestamp: Date.now(),
            actor: 'SYSTEM', // The MCP tool acts as the system
            type: 'PROJECT_CONFIG',
            payload: JSON.stringify({
              projectId,
              basePath,
              dependencies: dependencies || []
            }),
            previous_event_id: lastEventId
          });

          return {
            content: [{
               type: "text",
               text: `Successfully injected PROJECT_CONFIG event into stream. Event ID: ${eventId}`
            }]
          };
        } catch (err: any) {
          return {
            content: [{
               type: "text",
               text: `Error applying config: ${err.message}`
            }],
            isError: true
          };
        }
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
