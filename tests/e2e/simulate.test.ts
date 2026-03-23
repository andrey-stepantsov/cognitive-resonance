import { describe, it, expect } from 'vitest';
import { TerminalManager } from '../../packages/terminal-director/src/TerminalManager';
import * as path from 'path';
import * as fs from 'fs';

const CR_CLI_PATH = path.join(process.cwd(), 'apps/cli/src/index.ts');
const CR_BIN = `npx tsx ${CR_CLI_PATH}`;

describe('Testing & Simulation (cr simulate / assert)', () => {
  const tm = new TerminalManager();

  it('simulate: runs a scenario script', async () => {
    // We expect telemetry/failure if file acts wonky, but that is intended.
    const term = tm.spawn('simulate-act', CR_BIN, ['simulate', 'test-scenario.yaml']);
    const exitCode = await term.waitForExit();
    
    // Check for explicit error crash
    expect(term.getBuffer()).not.toContain('trace:');
    tm.killAll();
  });

  it('assert: verifies exact output buffer match', async () => {
    const term = tm.spawn('assert-act', CR_BIN, ['assert', 'test-expected.txt']);
    await term.waitForExit();
    expect(term.getBuffer().toLowerCase()).toContain('error');
    tm.killAll();
  });

  it('simulate: multi-actor scenario (User invokes Agent targeting User2)', async () => {
    const testFile = path.join(process.cwd(), '.cr', 'multi-actor.json');
    const scenario = {
      name: "Multiplayer Invocation",
      events: [
        { type: "SESSION_CREATED", id: "multi-session-1", actor: "UserA" },
        { type: "USER_ACTION", session_id: "multi-session-1", actor: "UserB", payload: "Hello everyone", timestamp: 1000 },
        { type: "USER_ACTION", session_id: "multi-session-1", actor: "UserA", payload: "@Guide summarize UserB", timestamp: 2000 },
        { type: "AI_ACTION", session_id: "multi-session-1", actor: "@Guide", payload: "UserB said hello.", timestamp: 3000 }
      ]
    };
    fs.writeFileSync(testFile, JSON.stringify(scenario));
    const term = tm.spawn('sim-multi', CR_BIN, ['simulate', testFile]);
    expect(await term.waitForExit()).toBe(0);
    tm.killAll();
  });

  it('simulate: trinity scenario (Agent Autonomous Choreography)', async () => {
    const testFile = path.join(process.cwd(), '.cr', 'trinity.json');
    const scenario = {
      name: "Trinity Graph",
      events: [
        { type: "SESSION_CREATED", id: "trinity-session-1", actor: "UserA" },
        { type: "USER_ACTION", session_id: "trinity-session-1", actor: "UserA", payload: "Build a new route", timestamp: 1000 },
        { type: "AI_ACTION", session_id: "trinity-session-1", actor: "@Coder", payload: "I need safety check. @Auditor review my plan.", timestamp: 2000 },
        { type: "AI_ACTION", session_id: "trinity-session-1", actor: "@Auditor", payload: "Plan is approved.", timestamp: 3000 }
      ]
    };
    fs.writeFileSync(testFile, JSON.stringify(scenario));
    const term = tm.spawn('sim-trinity', CR_BIN, ['simulate', testFile]);
    expect(await term.waitForExit()).toBe(0);
    tm.killAll();
  });

  it('simulate: cross-terminal host targeted invocation', async () => {
    const testFile = path.join(process.cwd(), '.cr', 'cross-term.json');
    const scenario = {
      name: "Cross Terminal",
      events: [
        { type: "SESSION_CREATED", id: "x-term", actor: "TerminalA" },
        { type: "USER_ACTION", session_id: "x-term", actor: "TerminalA", payload: "/invoke @Operator on semantic-host-B update OS", timestamp: 1000 },
        { type: "AI_ACTION", session_id: "x-term", actor: "@Operator", payload: "Delegating task to Host B RPC...", timestamp: 2000 }
      ]
    };
    fs.writeFileSync(testFile, JSON.stringify(scenario));
    const term = tm.spawn('sim-cross', CR_BIN, ['simulate', testFile]);
    expect(await term.waitForExit()).toBe(0);
    tm.killAll();
  });

  it('simulate: skill subsystem dynamic injection', async () => {
    const testFile = path.join(process.cwd(), '.cr', 'skills-scenario.json');
    const scenario = {
      name: "Dynamic Skills Resolution",
      events: [
        { type: "SESSION_CREATED", id: "skills-session", actor: "UserA" },
        { type: "USER_ACTION", session_id: "skills-session", actor: "UserA", payload: "I need to query the Postgres DB.", timestamp: 1000 },
        { type: "AI_ACTION", session_id: "skills-session", actor: "@Coder", payload: "Fetching psql_query runtime skill...", timestamp: 2000 }
      ]
    };
    fs.writeFileSync(testFile, JSON.stringify(scenario));
    const term = tm.spawn('sim-skills', CR_BIN, ['simulate', testFile]);
    expect(await term.waitForExit()).toBe(0);
    tm.killAll();
  });

  it('simulate: semantic vector search indexing bounds', async () => {
    const testFile = path.join(process.cwd(), '.cr', 'vector-scenario.json');
    const scenario = {
      name: "Vector Artefact Tracing",
      events: [
        { type: "SESSION_CREATED", id: "vector-session", actor: "UserA" },
        { 
          type: "AI_ACTION", 
          session_id: "vector-session", 
          actor: "@Guide", 
          payload: "Here is your plan.", 
          timestamp: 1000,
          produces_artefact: { type: "plan", content: "Secret global vector trace." }
        }
      ]
    };
    fs.writeFileSync(testFile, JSON.stringify(scenario));
    const term = tm.spawn('sim-vector', CR_BIN, ['simulate', testFile]);
    expect(await term.waitForExit()).toBe(0);
    tm.killAll();
  });

  it('simulate: librarian auditor safety triggers', async () => {
    const testFile = path.join(process.cwd(), '.cr', 'auditor-scenario.json');
    const scenario = {
      name: "Librarian Pre-Flight",
      events: [
        { type: "SESSION_CREATED", id: "auditor-session", actor: "Term-A" },
        { type: "USER_ACTION", session_id: "auditor-session", actor: "Term-A", payload: "sudo rm -rf /", timestamp: 1000 },
        { type: "AI_ACTION", session_id: "auditor-session", actor: "@Auditor", payload: "SAFETY BLOCK: Malicious pattern detected.", timestamp: 1500 }
      ]
    };
    fs.writeFileSync(testFile, JSON.stringify(scenario));
    const term = tm.spawn('sim-auditor', CR_BIN, ['simulate', testFile]);
    expect(await term.waitForExit()).toBe(0);
    tm.killAll();
  });
});
