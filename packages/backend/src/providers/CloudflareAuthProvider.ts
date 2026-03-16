import { AuthStatus } from '@cr/core';
import type { IAuthProvider, UserProfile } from '@cr/core';

const TOKEN_STORAGE_KEY = 'cr-cf-jwt';

export class CloudflareAuthProvider implements IAuthProvider {
  private endpoint: string;
  private listeners: Set<(status: AuthStatus, user?: UserProfile) => void> = new Set();
  private status: AuthStatus = AuthStatus.LOADING;
  private user?: UserProfile;
  private jwt?: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async init(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      const storedToken = globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY);

      if (storedToken) {
        this.jwt = storedToken;
        
        // Verify token by calling /api/auth/me
        const response = await fetch(`${this.endpoint}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${this.jwt}`
          }
        });

        if (response.ok) {
          const data = await response.json() as any;
          this.user = {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
          };
          this.status = AuthStatus.AUTHENTICATED;
        } else {
          throw new Error('Invalid token');
        }
      } else {
        throw new Error('No token');
      }
    } catch {
      this.user = undefined;
      this.jwt = undefined;
      this.status = AuthStatus.ANONYMOUS;
      globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
    }

    this.notifyListeners();
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  getUser(): UserProfile | undefined {
    return this.user;
  }

  getToken(): string | null {
    return this.jwt || null;
  }

  async login(): Promise<void> {
    console.warn('[CloudflareAuth] OAuth login not implemented. Please use email/password.');
    this.status = AuthStatus.ERROR;
    this.notifyListeners();
  }

  async loginWithEmail(email: string, password: string): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      const response = await fetch(`${this.endpoint}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json() as any;
      this.jwt = data.token;
      this.user = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
      };
      
      globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, this.jwt as string);
      this.status = AuthStatus.AUTHENTICATED;
    } catch (err) {
      console.error('[CloudflareAuth] Email login failed:', err);
      this.status = AuthStatus.ERROR;
    }

    this.notifyListeners();
  }

  async signupWithEmail(email: string, password: string): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    try {
      const name = email.split('@')[0];
      const response = await fetch(`${this.endpoint}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      if (!response.ok) {
        throw new Error('Signup failed');
      }

      const data = await response.json() as any;
      this.jwt = data.token;
      this.user = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
      };
      
      globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, this.jwt as string);
      this.status = AuthStatus.AUTHENTICATED;
    } catch (err) {
      console.error('[CloudflareAuth] Signup failed:', err);
      this.status = AuthStatus.ERROR;
    }

    this.notifyListeners();
  }

  async logout(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    this.user = undefined;
    this.jwt = undefined;
    globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
    this.status = AuthStatus.ANONYMOUS;
    
    this.notifyListeners();
  }

  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.user);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.status, this.user));
  }
}
