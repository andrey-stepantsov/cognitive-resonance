import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtefactManager } from '../ArtefactManager';
import { vfs } from '../GitContextManager';
import git from 'isomorphic-git';
import * as diff from 'diff';

vi.mock('isomorphic-git', () => {
  return {
    default: {
      init: vi.fn(),
      add: vi.fn(),
      commit: vi.fn().mockResolvedValue('mock-sha'),
      statusMatrix: vi.fn().mockResolvedValue([]),
      resolveRef: vi.fn().mockImplementation(async ({ ref }) => {
        if (ref === 'main') return 'main-sha';
        return 'draft-sha';
      }),
      currentBranch: vi.fn().mockResolvedValue('main'),
      branch: vi.fn(),
      checkout: vi.fn(),
      merge: vi.fn().mockResolvedValue({ oid: 'merge-sha' }),
      readBlob: vi.fn().mockImplementation(async ({ oid }) => {
        if (oid === 'main-sha') return { blob: Buffer.from('main content') };
        return { blob: Buffer.from('draft content') };
      })
    }
  };
});

vi.mock('diff', () => {
  return {
    createTwoFilesPatch: vi.fn().mockReturnValue('mock-patch-data')
  };
});

describe('ArtefactManager', () => {
  let manager: ArtefactManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ArtefactManager('test-session');
    
    // Mock vfs
    vfs.promises.stat = vi.fn().mockResolvedValue({});
    vfs.promises.mkdir = vi.fn().mockResolvedValue(true);
    vfs.promises.writeFile = vi.fn().mockResolvedValue(true);
  });

  describe('proposeDraft', () => {
    it('creates a new draft branch, stages and commits', async () => {
      const result = await manager.proposeDraft('testFile.md', 'new draft content', 'TestActor');
      
      expect(git.currentBranch).toHaveBeenCalled();
      expect(git.branch).toHaveBeenCalledWith(expect.objectContaining({
        ref: expect.stringContaining('draft/testFile.md/'),
        checkout: true
      }));
      expect(vfs.promises.writeFile).toHaveBeenCalledWith(expect.stringContaining('testFile.md'), 'new draft content', 'utf8');
      expect(git.add).toHaveBeenCalled();
      expect(git.commit).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Draft proposal for testFile.md',
        author: { name: 'TestActor', email: 'system@cr.local' }
      }));
      expect(result.branch).toContain('draft/testFile.md/');
      expect(result.commitSha).toBe('mock-sha');
    });

    it('checks out main if not currently on main', async () => {
      (git.currentBranch as any).mockResolvedValueOnce('other-branch');
      await manager.proposeDraft('testFile.md', 'content', 'Actor');
      
      expect(git.checkout).toHaveBeenCalledWith(expect.objectContaining({ ref: 'main' }));
      expect(git.branch).toHaveBeenCalled();
    });
  });

  describe('promoteDraft', () => {
    it('checks out main and merges draft branch cleanly', async () => {
      const result = await manager.promoteDraft('draft-branch', 'testFile.md');
      
      expect(git.checkout).toHaveBeenCalledWith(expect.objectContaining({ ref: 'main' }));
      expect(git.merge).toHaveBeenCalledWith(expect.objectContaining({
        ours: 'main',
        theirs: 'draft-branch',
        fastForward: true
      }));
      expect(result).toBe('main-sha'); // from resolveRef mock
    });
  });

  describe('getDiff', () => {
    it('generates a diff payload between main and the draft branch', async () => {
      const patch = await manager.getDiff('testFile.md', 'draft-branch');
      
      expect(git.readBlob).toHaveBeenCalledTimes(2);
      expect(diff.createTwoFilesPatch).toHaveBeenCalledWith(
        'testFile.md',
        'testFile.md',
        'main content',
        'draft content',
        'main',
        'draft-branch'
      );
      expect(patch).toBe('mock-patch-data');
    });
  });
});
