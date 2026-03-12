export const AuthStatus = {
  ANONYMOUS: 'anonymous',
  AUTHENTICATED: 'authenticated',
  LOADING: 'loading',
  ERROR: 'error'
} as const;

export type AuthStatus = typeof AuthStatus[keyof typeof AuthStatus];

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  isMock?: boolean;
}

export interface IAuthProvider {
  /**
   * Initializes the provider, potentially checking for existing sessions.
   */
  init(): Promise<void>;

  /**
   * Gets the current authentication status.
   */
  getStatus(): AuthStatus;

  /**
   * Returns the current user profile if authenticated, undefined otherwise.
   */
  getUser(): UserProfile | undefined;

  /**
   * Initiates the login flow.
   */
  login(): Promise<void>;

  /**
   * Logs the user out.
   */
  logout(): Promise<void>;

  /**
   * Subscribes to authentication state changes.
   * @param listener Callback when auth state changes
   * @returns Unsubscribe function
   */
  onChange(listener: (status: AuthStatus, user?: UserProfile) => void): () => void;
}
