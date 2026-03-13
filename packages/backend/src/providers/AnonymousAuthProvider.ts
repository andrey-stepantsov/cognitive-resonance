import { AuthStatus } from '@cr/core';
import type { IAuthProvider, UserProfile } from '@cr/core';

export class AnonymousAuthProvider implements IAuthProvider {
  private listeners: Set<(status: AuthStatus, user?: UserProfile) => void> = new Set();
  private status: AuthStatus = AuthStatus.ANONYMOUS;

  async init(): Promise<void> {
    // Local provider is instantly ready
    this.status = AuthStatus.ANONYMOUS;
    this.notifyListeners();
    return Promise.resolve();
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  getUser(): UserProfile | undefined {
    return undefined;
  }

  async login(): Promise<void> {
    // In a real app this might trigger a modal to switch to the Cloud provider,
    // but the Anonymous provider itself doesn't authentically "log in".
    console.warn("login() called on AnonymousAuthProvider. This should be handled by the UI swapping to the CloudAuthProvider.");
    return Promise.resolve();
  }

  async loginWithEmail(_email: string, _password: string): Promise<void> {
    console.warn("loginWithEmail() called on AnonymousAuthProvider.");
    return Promise.resolve();
  }

  async signupWithEmail(_email: string, _password: string): Promise<void> {
    console.warn("signupWithEmail() called on AnonymousAuthProvider.");
    return Promise.resolve();
  }

  async logout(): Promise<void> {
    return Promise.resolve();
  }

  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.status, this.getUser());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.status, this.getUser()));
  }
}
