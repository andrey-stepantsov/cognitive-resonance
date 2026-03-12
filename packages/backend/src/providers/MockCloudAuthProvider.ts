import { AuthStatus } from '@cr/core';
import type { IAuthProvider, UserProfile } from '@cr/core';

const MOCK_DELAY = 800;
const SESSION_KEY = 'mock-cloud-auth-session';

export class MockCloudAuthProvider implements IAuthProvider {
  private listeners: Set<(status: AuthStatus, user?: UserProfile) => void> = new Set();
  private status: AuthStatus = AuthStatus.LOADING;
  private user?: UserProfile;

  async init(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    // Simulate network check for existing session
    await new Promise(r => setTimeout(r, MOCK_DELAY));

    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      this.user = JSON.parse(savedSession);
      this.status = AuthStatus.AUTHENTICATED;
    } else {
      this.user = undefined;
      this.status = AuthStatus.ANONYMOUS;
    }
    
    this.notifyListeners();
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  getUser(): UserProfile | undefined {
    return this.user;
  }

  async login(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    // Simulate OAuth / Login redirect delay
    await new Promise(r => setTimeout(r, MOCK_DELAY * 2));

    this.user = {
      id: 'mock-user-1234',
      name: 'Test Engineer',
      email: 'test@example.com',
      isMock: true
    };
    
    // Persist mock session
    localStorage.setItem(SESSION_KEY, JSON.stringify(this.user));
    
    this.status = AuthStatus.AUTHENTICATED;
    this.notifyListeners();
  }

  async logout(): Promise<void> {
    this.status = AuthStatus.LOADING;
    this.notifyListeners();

    // Simulate logout request
    await new Promise(r => setTimeout(r, MOCK_DELAY));

    this.user = undefined;
    localStorage.removeItem(SESSION_KEY);
    
    this.status = AuthStatus.ANONYMOUS;
    this.notifyListeners();
  }

  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.user);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.status, this.user));
  }
}
