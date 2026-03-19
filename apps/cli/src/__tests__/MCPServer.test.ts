import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseEngine } from '../db/DatabaseEngine';
import { CognitiveMCPServer } from '../services/MCPServer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Intercept handlers
let handlers: Function[] = [];
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: class {
      setRequestHandler(schema: any, handler: any) {
        handlers.push(handler);
      }
      connect() { return Promise.resolve(); }
    }
  };
});


describe('CognitiveMCPServer', () => {
  let db: DatabaseEngine;
  let server: CognitiveMCPServer;
  let tempDir: string;
  let dbPath: string;
  let sessionId: string;

  beforeEach(() => {
    handlers.length = 0;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-mcp-test-'));
    dbPath = path.join(tempDir, 'cr.sqlite');
    db = new DatabaseEngine(dbPath);
    sessionId = db.createSession('TEST_USER');
    server = new CognitiveMCPServer(db, sessionId);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates PROJECT_CONFIG events when handling tool calls natively', async () => {
    // We capture the handlers from our mock above (List is index 0, Call is index 1)
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    const callHandler = handlers[1];

    const req = {
       params: {
         name: 'registerProject',
         arguments: {
           projectId: 'module-x',
           basePath: 'packages/module-x'
         }
       }
    };
    
    const result = await callHandler(req);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Successfully injected PROJECT_CONFIG');
    
    const events = db.query("SELECT * FROM events WHERE type = 'PROJECT_CONFIG' AND session_id = ?", [sessionId]) as any[];
    expect(events.length).toBe(1);
    
    const payload = JSON.parse(events[0].payload);
    expect(payload.projectId).toBe('module-x');
    expect(payload.basePath).toBe('packages/module-x');
    expect(payload.dependencies).toEqual([]); // defaulted array
  });

  it('generates PROJECT_CONFIG events for updateProjectDependencies', async () => {
    const callHandler = handlers[1];
    const req = {
       params: {
         name: 'updateProjectDependencies',
         arguments: {
           projectId: 'module-y',
           basePath: 'packages/module-y',
           dependencies: ['module-x']
         }
       }
    };
    
    const result = await callHandler(req);
    expect(result.isError).toBeUndefined();
    
    const events = db.query("SELECT * FROM events WHERE type = 'PROJECT_CONFIG' AND session_id = ?", [sessionId]) as any[];
    const payload = JSON.parse(events[events.length - 1].payload);
    expect(payload.projectId).toBe('module-y');
    expect(payload.dependencies).toEqual(['module-x']);
  });

  it('handles invalid arguments gracefully', async () => {
    const callHandler = handlers[1];
    const req = {
       params: {
         name: 'registerProject',
         arguments: null
       }
    };
    
    const result = await callHandler(req);
    expect(result.toolResult).toBe('Invalid arguments');
  });

  it('handles unknown tools gracefully', async () => {
    const callHandler = handlers[1];
    const req = {
       params: {
         name: 'unknownTool',
         arguments: {}
       }
    };
    
    await expect(callHandler(req)).rejects.toThrow('Unknown tool: unknownTool');
  });

  it('returns an error if the database fails', async () => {
    db.appendEvent = vi.fn().mockImplementation(() => { throw new Error('DB Error'); });
    const callHandler = handlers[1];
    const req = {
       params: {
         name: 'registerProject',
         arguments: { projectId: 'a', basePath: 'b' }
       }
    };
    
    const result = await callHandler(req);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error applying config: DB Error');
  });

  it('lists available tools natively', async () => {
    const listHandler = handlers[0];
    const result = await listHandler({});
    expect(result.tools.length).toBe(2);
    expect(result.tools[0].name).toBe('registerProject');
    expect(result.tools[1].name).toBe('updateProjectDependencies');
  });

  it('connects via stdio during start', async () => {
    // start() calls server.connect which we mocked
    await expect(server.start()).resolves.not.toThrow();
  });
});

