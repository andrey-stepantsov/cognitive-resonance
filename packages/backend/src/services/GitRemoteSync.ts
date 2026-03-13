import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { authService } from './AuthService';

export class GitRemoteSync {
  private remoteUrl: string;

  constructor() {
    this.remoteUrl = 'http://localhost:8787/git';
  }

  configure(url: string) {
    if (url) this.remoteUrl = url;
  }

  /**
   * Pushes a local isomorphic-git virtual repository to the Cloudflare remote.
   * Injects the Appwrite JWT for authentication.
   */
  async pushToRemote(fs: any, dir: string, branch: string = 'main'): Promise<void> {
    try {
      const user = await authService.getCurrentUser();
      let token = '';
      
      if (user) {
        // We generate a JWT to pass to Cloudflare for validation
        const jwtResponse = await authService.getAccount().createJWT();
        token = jwtResponse.jwt;
      }

      console.log(`[GitRemoteSync] Pushing ${dir} to ${this.remoteUrl}`);

      const pushResult = await git.push({
        fs,
        http,
        dir,
        remote: 'origin',
        url: `${this.remoteUrl}${dir}`, // e.g. /git/session-123
        ref: branch,
        headers: {
          'Authorization': `Bearer ${token}`
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
      const user = await authService.getCurrentUser();
      let token = '';
      
      if (user) {
        const jwtResponse = await authService.getAccount().createJWT();
        token = jwtResponse.jwt;
      }

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
          'Authorization': `Bearer ${token}`
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
