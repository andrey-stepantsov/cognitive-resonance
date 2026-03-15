import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

export class GitRemoteSync {
  private remoteUrl: string;

  constructor() {
    this.remoteUrl = 'http://localhost:8787/git';
  }

  configure(url: string) {
    if (url) {
      // Ensure the URL always ends with /git for the Cloudflare Worker routing
      const cleanUrl = url.replace(/\/$/, '');
      this.remoteUrl = cleanUrl.endsWith('/git') ? cleanUrl : `${cleanUrl}/git`;
    }
  }

  /**
   * Pushes a local isomorphic-git virtual repository to the Cloudflare remote.
   * Uses a static bearer token (no auth backend required).
   */
  async pushToRemote(fs: any, dir: string, branch: string = 'main'): Promise<void> {
    try {
      console.log(`[GitRemoteSync] Pushing ${dir} to ${this.remoteUrl}`);

      const pushResult = await git.push({
        fs,
        http,
        dir,
        remote: 'origin',
        url: `${this.remoteUrl}${dir}`, // e.g. /git/session-123
        ref: branch,
        headers: {
          'Authorization': 'Bearer cr-session-token'
        }
      });

      console.log('[GitRemoteSync] Push complete:', pushResult);

    } catch (err) {
      console.error('[GitRemoteSync] Failed to push to remote:', err);
      throw err;
    }
  }

  /**
   * Fetches/Pulls from the remote repository.
   */
  async pullFromRemote(fs: any, dir: string, branch: string = 'main'): Promise<void> {
    try {
      console.log(`[GitRemoteSync] Pulling ${dir} from ${this.remoteUrl}`);

      await git.pull({
        fs,
        http,
        dir,
        remote: 'origin',
        url: `${this.remoteUrl}${dir}`,
        ref: branch,
        singleBranch: true,
        author: {
          name: 'Cognitive Resonance',
          email: 'system@cr.local'
        },
        headers: {
          'Authorization': 'Bearer cr-session-token'
        }
      });

      console.log('[GitRemoteSync] Pull complete');

    } catch (err) {
      console.error('[GitRemoteSync] Failed to pull from remote:', err);
      throw err;
    }
  }
}

export const gitRemoteSync = new GitRemoteSync();
