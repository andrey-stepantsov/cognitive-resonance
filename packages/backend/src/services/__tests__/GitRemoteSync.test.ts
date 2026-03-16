import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitRemoteSync } from '../GitRemoteSync';

vi.mock('isomorphic-git', () => {
  return {
    default: {
      push: vi.fn(),
      pull: vi.fn(),
    }
  };
});

describe('GitRemoteSync', () => {
  let sync: GitRemoteSync;

  beforeEach(() => {
    vi.clearAllMocks();
    sync = new GitRemoteSync();
    sync.configure('http://localhost:8787/git', 'my-real-api-key');
  });

  it('pushes with the configured API key', async () => {
    const gitMock = await import('isomorphic-git');
    const mockFs = {};
    
    await sync.pushToRemote(mockFs, '/session-123', 'main');
    
    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/session-123',
        remote: 'origin',
        url: 'http://localhost:8787/git/session-123',
        headers: {
          'Authorization': 'Bearer my-real-api-key'
        }
      })
    );
  });

  it('pushes the global workspace repository with configured key', async () => {
    const gitMock = await import('isomorphic-git');
    const mockFs = {};
    
    await sync.pushToRemote(mockFs, '/global-workspace', 'main');
    
    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/global-workspace',
        remote: 'origin',
        url: 'http://localhost:8787/git/global-workspace',
        headers: {
          'Authorization': 'Bearer my-real-api-key'
        }
      })
    );
  });

  it('pulls with the configured API key', async () => {
    const gitMock = await import('isomorphic-git');
    const mockFs = {};
    
    await sync.pullFromRemote(mockFs, '/session-123', 'main');
    
    expect(gitMock.default.pull).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/session-123',
        remote: 'origin',
        url: 'http://localhost:8787/git/session-123',
        headers: {
          'Authorization': 'Bearer my-real-api-key'
        }
      })
    );
  });

  it('throws when push is called without configured API key', async () => {
    const noKeySync = new GitRemoteSync();
    noKeySync.configure('http://localhost:8787/git');
    const mockFs = {};
    
    await expect(noKeySync.pushToRemote(mockFs, '/session-123')).rejects.toThrow(
      'API key not configured'
    );
  });

  it('throws when pull is called without configured API key', async () => {
    const noKeySync = new GitRemoteSync();
    noKeySync.configure('http://localhost:8787/git');
    const mockFs = {};
    
    await expect(noKeySync.pullFromRemote(mockFs, '/session-123')).rejects.toThrow(
      'API key not configured'
    );
  });

  it('appends /git to URL if not present', async () => {
    const gitMock = await import('isomorphic-git');
    const s = new GitRemoteSync();
    s.configure('https://worker.example.com', 'key');

    await s.pushToRemote({}, '/test');

    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://worker.example.com/git/test',
      })
    );
  });

  describe('Error Handling', () => {
    it('throws when push fails', async () => {
      const gitMock = await import('isomorphic-git');
      gitMock.default.push = vi.fn().mockRejectedValue(new Error('Push Error'));
      const mockFs = {};
      
      await expect(sync.pushToRemote(mockFs, '/session-123', 'main')).rejects.toThrow('Push Error');
    });

    it('throws when pull fails', async () => {
      const gitMock = await import('isomorphic-git');
      gitMock.default.pull = vi.fn().mockRejectedValue(new Error('Pull Error'));
      const mockFs = {};
      
      await expect(sync.pullFromRemote(mockFs, '/session-123', 'main')).rejects.toThrow('Pull Error');
    });
  });
});
