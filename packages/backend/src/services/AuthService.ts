import { Client, Account, type Models } from 'appwrite';

export class AuthService {
  private client: Client;
  private account: Account;

  constructor() {
    this.client = new Client();
    this.account = new Account(this.client);
  }

  configure(endpoint: string, project: string) {
    if (endpoint) this.client.setEndpoint(endpoint);
    if (project) this.client.setProject(project);
  }


  getAccount(): Account {
    return this.account;
  }

  async getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
    try {
      return await this.account.get();
    } catch (err) {
      return null;
    }
  }

  async loginWithOAuth(provider: string, successUrl: string, failureUrl: string): Promise<void> {
    // Appwrite creates a full browser redirect for OAuth
    // The provider string should be e.g. 'google', 'github'
    await this.account.createOAuth2Session(provider as any, successUrl, failureUrl);
  }

  async logout(): Promise<void> {
    try {
      await this.account.deleteSession('current');
    } catch (err) {
      console.error('Logout error:', err);
    }
  }
}

// Export a singleton instance
export const authService = new AuthService();
