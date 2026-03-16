import { Client, Account } from 'appwrite';
import { AuthStatus } from '@cr/core';
import type { IAuthProvider, UserProfile } from '@cr/core';

const TOKEN_STORAGE_KEY = 'cr-appwrite-jwt';
const TOKEN_EXPIRY_KEY = 'cr-appwrite-jwt-exp';

export class AppwriteAuthProvider implements IAuthProvider {
  private client: Client;
  private account: Account;
  private listeners: Set<(status: AuthStatus, user?: UserProfile) => void> = new Set();
  private status: AuthStatus = AuthStatus.LOADING;
  private user?: UserProfile;
  private jwt?: string;

  constructor(endpoint: string, projectId: string) {
    this.client = new Client();
    this.client.setEndpoint(endpoint).setProject(projectId);
    this.account = new Account(this.client);
  }

  async init(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      // Check if we have a stored JWT that's still valid
      const storedToken = globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY);
      const storedExpiry = globalThis.localStorage?.getItem(TOKEN_EXPIRY_KEY);

      if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry, 10)) {
        this.jwt = storedToken;
      }

      // Try to get the current session from Appwrite
      const appwriteUser = await this.account.get();

      this.user = {
        id: appwriteUser.$id,
        name: appwriteUser.name || appwriteUser.email,
        email: appwriteUser.email,
      };
      this.status = AuthStatus.AUTHENTICATED;

      // Refresh JWT if we have a session but no valid token
      if (!this.jwt) {
        await this.refreshJwt();
      }
    } catch {
      // No active session
      this.user = undefined;
      this.jwt = undefined;
      this.status = AuthStatus.ANONYMOUS;
      globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
      globalThis.localStorage?.removeItem(TOKEN_EXPIRY_KEY);
    }

    this.notifyListeners();
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  getUser(): UserProfile | undefined {
    return this.user;
  }

  /**
   * Returns the current Appwrite JWT for use in Authorization headers.
   */
  getToken(): string | null {
    return this.jwt || null;
  }

  async login(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      // Redirect-based OAuth flow (Google)
      // This will redirect the browser away and back
      this.account.createOAuth2Session(
        'google' as any,
        globalThis.location?.href || '/', // success URL
        globalThis.location?.href || '/', // failure URL
      );
    } catch (err) {
      console.error('[AppwriteAuth] OAuth login failed:', err);
      this.status = AuthStatus.ERROR;
      this.notifyListeners();
    }
  }

  async loginWithEmail(email: string, password: string): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      await this.account.createEmailPasswordSession(email, password);
      const appwriteUser = await this.account.get();

      this.user = {
        id: appwriteUser.$id,
        name: appwriteUser.name || email,
        email: appwriteUser.email,
      };

      await this.refreshJwt();
      this.status = AuthStatus.AUTHENTICATED;
    } catch (err) {
      console.error('[AppwriteAuth] Email login failed:', err);
      this.status = AuthStatus.ERROR;
    }

    this.notifyListeners();
  }

  async signupWithEmail(email: string, password: string): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      // Create account, then auto-login
      const userId = 'unique()';
      await this.account.create(userId, email, password);
      await this.account.createEmailPasswordSession(email, password);
      const appwriteUser = await this.account.get();

      this.user = {
        id: appwriteUser.$id,
        name: appwriteUser.name || email,
        email: appwriteUser.email,
      };

      await this.refreshJwt();
      this.status = AuthStatus.AUTHENTICATED;
    } catch (err) {
      console.error('[AppwriteAuth] Signup failed:', err);
      this.status = AuthStatus.ERROR;
    }

    this.notifyListeners();
  }

  async logout(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      await this.account.deleteSession('current');
    } catch {
      // Session may already be expired
    }

    this.user = undefined;
    this.jwt = undefined;
    globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
    globalThis.localStorage?.removeItem(TOKEN_EXPIRY_KEY);
    this.status = AuthStatus.ANONYMOUS;
    this.notifyListeners();
  }

  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.user);
    return () => this.listeners.delete(listener);
  }

  private async refreshJwt(): Promise<void> {
    try {
      const response = await this.account.createJWT();
      this.jwt = response.jwt;

      // Appwrite JWTs are valid for 15 minutes
      const expiryMs = Date.now() + 15 * 60 * 1000;
      globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, this.jwt);
      globalThis.localStorage?.setItem(TOKEN_EXPIRY_KEY, String(expiryMs));
    } catch (err) {
      console.error('[AppwriteAuth] Failed to create JWT:', err);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.status, this.user));
  }
}
