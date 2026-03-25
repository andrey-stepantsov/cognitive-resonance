import { describe, it, expect } from 'vitest';
import { ArtefactManager } from '../ArtefactManager';
import type { IEvent } from 'cr-core-contracts';

describe('ArtefactManager', () => {

  it('proposes a full replacement when virtual state does not have the file', async () => {
    // Empty session, no previous events
    const manager = new ArtefactManager('/tmp/mock', []);
    
    const draft = await manager.proposeDraft('src/test.txt', 'Hello World');
    
    expect(draft.path).toBe('src/test.txt');
    expect(draft.isFullReplacement).toBe(false);
    expect(draft.patch).toContain('@@');
  });

  it('computes a unified diff patch when virtual state has the existing file', async () => {
    // Fake events establishing prior state
    const priorEvents: IEvent[] = [
      {
        event_id: 'evt-1',
        session_id: 's1',
        timestamp: 100,
        type: 'ARTEFACT_PROPOSAL',
        actor: 'USER',
        payload: JSON.stringify({
          path: 'src/config.json',
          patch: '{\n  "version": 1\n}\n',
          isFullReplacement: true
        }),
        previous_event_id: null
      }
    ];

    const manager = new ArtefactManager('/tmp/mock', priorEvents);
    
    // Propose an edit changing version 1 to 2
    const draft = await manager.proposeDraft('src/config.json', '{\n  "version": 2\n}\n');
    
    expect(draft.path).toBe('src/config.json');
    expect(draft.isFullReplacement).toBe(false);
    expect(draft.patch).toContain('@@'); 
    expect(draft.patch).toContain('-  "version": 1');
    expect(draft.patch).toContain('+  "version": 2');
  });
});
