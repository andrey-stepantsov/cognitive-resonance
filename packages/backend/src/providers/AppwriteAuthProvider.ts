import { IAuthProvider, AuthStatus, UserProfile } from '@cr/core/src/interfaces/IAuthProvider';
import { authService } from '../services/AuthService';
import { Models } from 'appwrite';

export class AppwriteAuthProvider implements IAuthProvider {
  private status: AuthStatus = AuthStatus.LOADING;
  private user?: UserProfile;
  private listeners: Set<(status: AuthStatus, user?: UserProfile) => void> = new Set();

  async init(): Promise<void> {
    this.setStatus(AuthStatus.LOADING);
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        this.setUserFromModels(currentUser);
        this.setStatus(AuthStatus.AUTHENTICATED);
      } else {
        this.user = undefined;
        this.setStatus(AuthStatus.ANONYMOUS);
      }
    } catch (err) {
      console.error('Appwrite init error', err);
      this.user = undefined;
      this.setStatus(AuthStatus.ANONYMOUS); // Fallback to anon
    }
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  getUser(): UserProfile | undefined {
    return this.user;
  }

  async login(): Promise<void> {
    // In a real flow, this triggers the OAuth redirect or prompts for email.
    // For now, we assume the UI handles the specific auth service call.
    // However, if the interface demands a default login logic:
    await authService.loginWithOAuth('google', window.location.href, window.location.href);
  }

  async logout(): Promise<void> {
    await authService.logout();
    this.user = undefined;
    this.setStatus(AuthStatus.ANONYMOUS);
  }

  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void {
    this.listeners.add(listener);
    // prime
    listener(this.status, this.user);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: AuthStatus) {
    if (this.status !== status) {
      this.status = status;
      this.notify();
    }
  }

  private setUserFromModels(modelUser: Models.User<Models.Preferences>) {
    this.user = {
      id: modelUser.$id,
      name: modelUser.name || 'Unknown User',
      email: modelUser.email,
    };
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.status, this.user);
    }
  }
}
