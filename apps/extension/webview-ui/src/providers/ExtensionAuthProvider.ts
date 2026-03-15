import { AuthStatus } from '@cr/core';
import type { IAuthProvider, UserProfile } from '@cr/core';

export class ExtensionAuthProvider implements IAuthProvider {
  private listeners: Set<(status: AuthStatus, user?: UserProfile) => void> = new Set();
  private status: AuthStatus = AuthStatus.AUTHENTICATED;
  private user: UserProfile = {
    id: 'vscode-local-user',
    name: 'VS Code User',
    email: 'local@vscode.extension',
    isMock: true
  };

  async init(): Promise<void> {
    this.status = AuthStatus.AUTHENTICATED;
    this.notifyListeners();
    return Promise.resolve();
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  getUser(): UserProfile | undefined {
    return this.user;
  }

  async login(): Promise<void> {
    return Promise.resolve();
  }

  async loginWithEmail(): Promise<void> {
    return Promise.resolve();
  }

  async signupWithEmail(): Promise<void> {
    return Promise.resolve();
  }

  async logout(): Promise<void> {
    return Promise.resolve();
  }

  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.getUser());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.status, this.getUser()));
  }
}
