import { describe, it, expect } from 'vitest';
import { Materializer } from '../Materializer';
import type { ArtefactProposalPayload } from 'cr-core-contracts';

describe('Materializer Virtual State Gen', () => {
  it('computes correct virtual file contents from sequential proposals', () => {
    const events = [
      {
        id: '1', event_id: '1', session_id: 'test', actor: 'system', type: 'ARTEFACT_PROPOSAL', timestamp: 1000,
        payload: {
           path: 'src/main.ts',
           patch: 'Initial Content\n',
           isFullReplacement: true
        } as ArtefactProposalPayload
      },
      {
        id: '2', event_id: '2', session_id: 'test', actor: 'system', type: 'ARTEFACT_PROPOSAL', timestamp: 1001,
        payload: {
           path: 'src/main.ts',
           patch: 'Index: src/main.ts\n===================================================================\n--- src/main.ts\n+++ src/main.ts\n@@ -1,1 +1,2 @@\n Initial Content\n+Additional Line',
           isFullReplacement: false
        } as ArtefactProposalPayload
      }
    ];
    
    // Test the compute logic directly - we don't need a real target dir to compute in-memory map
    const materializer = new Materializer('/tmp/mock');
    
    // Rebuild the abstract file state
    const virtualFiles = materializer.computeVirtualState(events as any);
    
    expect(virtualFiles.get('src/main.ts')).toBe('Initial Content\nAdditional Line\n');
  });
});
