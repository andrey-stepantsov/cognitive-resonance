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
      const isLocal = globalThis.localStorage?.getItem('cr_local_mode') === 'true';

      if (storedToken) {
        this.jwt = storedToken;
        
        if (isLocal) {
          this.user = { id: 'local', name: 'Local Dev', email: 'dev@localhost' };
        } else {
          this.user = { id: 'cloud', name: 'Cloud User', email: 'cloud@edge' };
        }
        
        this.status = AuthStatus.AUTHENTICATED;
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
    console.warn('[CloudflareAuth] OAuth login not implemented. Please use connectCloud or connectLocal.');
    this.status = AuthStatus.ERROR;
    this.notifyListeners();
  }

  async connectLocal(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    this.jwt = 'local-dev-token';
    this.user = {
      id: 'local',
      name: 'Local Dev',
      email: 'dev@localhost',
    };
    
    globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, this.jwt);
    globalThis.localStorage?.setItem('cr_local_mode', 'true');
    this.status = AuthStatus.AUTHENTICATED;
    
    this.notifyListeners();
    globalThis.location?.reload();
  }

  async connectCloud(apiKey: string): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    this.jwt = apiKey;
    this.user = {
      id: 'cloud',
      name: 'Cloud User',
      email: 'cloud@edge',
    };
    
    globalThis.localStorage?.setItem(TOKEN_STORAGE_KEY, this.jwt);
    globalThis.localStorage?.setItem('cr_local_mode', 'false');
    this.status = AuthStatus.AUTHENTICATED;
    
    this.notifyListeners();
    globalThis.location?.reload();
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
