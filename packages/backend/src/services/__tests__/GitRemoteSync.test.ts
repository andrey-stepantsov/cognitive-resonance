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

  it('throws when push is called without any auth configured', async () => {
    const noKeySync = new GitRemoteSync();
    noKeySync.configure('http://localhost:8787/git');
    const mockFs = {};
    
    await expect(noKeySync.pushToRemote(mockFs, '/session-123')).rejects.toThrow(
      'No auth configured'
    );
  });

  it('throws when pull is called without any auth configured', async () => {
    const noKeySync = new GitRemoteSync();
    noKeySync.configure('http://localhost:8787/git');
    const mockFs = {};
    
    await expect(noKeySync.pullFromRemote(mockFs, '/session-123')).rejects.toThrow(
      'No auth configured'
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

  // --- Dynamic token (configureAuth) ---

  it('uses dynamic token from configureAuth over static apiKey', async () => {
    const gitMock = await import('isomorphic-git');
    sync.configureAuth(() => 'jwt-token-from-dynamic-source');
    const mockFs = {};

    await sync.pushToRemote(mockFs, '/session-123', 'main');

    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer jwt-token-from-dynamic-source'
        }
      })
    );
  });

  it('falls back to static apiKey when tokenGetter returns null', async () => {
    const gitMock = await import('isomorphic-git');
    sync.configureAuth(() => null);
    const mockFs = {};

    await sync.pushToRemote(mockFs, '/session-123', 'main');

    expect(gitMock.default.push).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer my-real-api-key'
        }
      })
    );
  });

  it('uses dynamic token for pull as well', async () => {
    const gitMock = await import('isomorphic-git');
    sync.configureAuth(() => 'pull-jwt');
    const mockFs = {};

    await sync.pullFromRemote(mockFs, '/session-123', 'main');

    expect(gitMock.default.pull).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer pull-jwt'
        }
      })
    );
  });

  it('throws when neither tokenGetter nor apiKey are set', async () => {
    const noAuthSync = new GitRemoteSync();
    noAuthSync.configure('http://localhost:8787/git');
    noAuthSync.configureAuth(() => null);
    const mockFs = {};

    await expect(noAuthSync.pushToRemote(mockFs, '/session-123')).rejects.toThrow(
      'No auth configured'
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

