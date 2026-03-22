import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArtefactManager } from '../services/ArtefactManager';
import { Materializer } from '../services/Materializer';

describe('ArtefactManager', () => {
  let virtualFileSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    virtualFileSpy = vi.spyOn(Materializer.prototype, 'getVirtualFileContent').mockResolvedValue('old content\ndiff me');
  });

  afterEach(() => {
    virtualFileSpy.mockRestore();
  });

  it('proposeDraft translates full file contents into unified diff patch', async () => {
    const manager = new ArtefactManager('/fake/dir', []);
    const proposal = await manager.proposeDraft('test.txt', 'new content\ndiff me');
    
    expect(proposal.path).toBe('test.txt');
    expect(proposal.isFullReplacement).toBe(false);
    expect(proposal.patch).toContain('--- test.txt');
    expect(proposal.patch).toContain('+++ test.txt');
    expect(proposal.patch).toContain('-old content');
    expect(proposal.patch).toContain('+new content');
  });

  it('proposeDrafts handles an array of files concurrently', async () => {
    const manager = new ArtefactManager('/fake/dir', []);
    const proposals = await manager.proposeDrafts([
      { path: 'a.ts', content: 'new content a' },
      { path: 'b.ts', content: 'new content b' }
    ]);
    
    expect(proposals).toHaveLength(2);
    expect(proposals[0].path).toBe('a.ts');
    expect(proposals[1].path).toBe('b.ts');
  });

  it('proposeDrafts throws an error if an empty array is provided', async () => {
    const manager = new ArtefactManager('/fake/dir', []);
    await expect(manager.proposeDrafts([])).rejects.toThrow('No files provided');
    // @ts-expect-error - testing invalid runtime input
    await expect(manager.proposeDrafts(null)).rejects.toThrow('No files provided');
  });
});
