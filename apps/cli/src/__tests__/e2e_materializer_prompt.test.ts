import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestCluster } from './TestCluster';
import * as gemini from '@cr/core/src/services/GeminiService';

describe('E2E Materializer Context Injection', () => {
  let cluster: TestCluster;

  beforeEach(() => {
    cluster = new TestCluster();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    cluster.teardown();
    vi.restoreAllMocks();
  });

  it('injects virtual filesystem state into the AI system prompt during chat', async () => {
    // Mock the Gemini response
    const generateSpy = vi.spyOn(gemini, 'generateResponse').mockResolvedValue({
      reply: 'Mocked AI Response',
      dissonanceScore: 10
    } as any);

    const sessionId = cluster.db.createSession('TEST_USER');
    
    // Inject a virtual file via ARTEFACT_PROPOSAL (like an import or previous edit)
    cluster.db.appendEvent({
      session_id: sessionId,
      timestamp: Date.now(),
      actor: 'SYSTEM',
      type: 'ARTEFACT_PROPOSAL',
      payload: JSON.stringify({ path: 'src/index.ts', patch: 'console.log("hello world");', isFullReplacement: true }),
      previous_event_id: null
    });

    await cluster.bootRepl(sessionId);
    await new Promise(r => setTimeout(r, 50));
    
    cluster.replIo.simulateLine('What is in my index file?');
    await new Promise(r => setTimeout(r, 100)); // wait for async chat handler
    
    // Assert that generateResponse was called with the systemPrompt containing the injected file context
    expect(generateSpy).toHaveBeenCalled();
    const callArgs = generateSpy.mock.calls[0];
    const systemPromptArg = callArgs[2]; // systemPrompt is the 3rd argument
    
    expect(systemPromptArg).toContain('Current Workspace Virtual Filesystem');
    expect(systemPromptArg).toContain('[File: src/index.ts]');
    expect(systemPromptArg).toContain('console.log("hello world");');
  });
});
