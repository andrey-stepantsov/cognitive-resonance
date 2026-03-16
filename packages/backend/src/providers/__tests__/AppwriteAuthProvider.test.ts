import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AuthStatus } from '@cr/core';

// ─── Mock Appwrite SDK ───────────────────────────────────────────

const mockGet = vi.fn();
const mockCreateJWT = vi.fn();
const mockCreateOAuth2Session = vi.fn();
const mockCreateEmailPasswordSession = vi.fn();
const mockCreate = vi.fn();
const mockDeleteSession = vi.fn();

vi.mock('appwrite', () => {
  // Must use `function` (not arrow) for class constructors so `new` works
  const MockClient = function(this: any) {
    this.setEndpoint = vi.fn().mockReturnValue(this);
    this.setProject = vi.fn().mockReturnValue(this);
  };

  const MockAccount = function(this: any, _client: any) {
    this.get = mockGet;
    this.createJWT = mockCreateJWT;
    this.createOAuth2Session = mockCreateOAuth2Session;
    this.createEmailPasswordSession = mockCreateEmailPasswordSession;
    this.create = mockCreate;
    this.deleteSession = mockDeleteSession;
  };

  return { Client: MockClient, Account: MockAccount };
});

// We MUST import the provider AFTER the mock is set up
import { AppwriteAuthProvider } from '../AppwriteAuthProvider';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ─── Tests ──────────────────────────────────────────────────────

describe('AppwriteAuthProvider', () => {
  let provider: AppwriteAuthProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    provider = new AppwriteAuthProvider('https://cloud.appwrite.io/v1', 'cognitive-resonance');
  });

  describe('init', () => {
    it('sets AUTHENTICATED when Appwrite session exists', async () => {
      mockGet.mockResolvedValue({
        $id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
      });
      mockCreateJWT.mockResolvedValue({ jwt: 'test-jwt-token' });

      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getUser()).toEqual({
        id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(provider.getToken()).toBe('test-jwt-token');
    });

    it('sets ANONYMOUS when no Appwrite session exists', async () => {
      mockGet.mockRejectedValue(new Error('Unauthorized'));

      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.ANONYMOUS);
      expect(provider.getUser()).toBeUndefined();
      expect(provider.getToken()).toBeNull();
    });

    it('uses stored JWT if still valid', async () => {
      localStorageMock.setItem('cr-appwrite-jwt', 'stored-jwt');
      localStorageMock.setItem('cr-appwrite-jwt-exp', String(Date.now() + 60000));

      mockGet.mockResolvedValue({
        $id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
      });

      await provider.init();

      expect(provider.getToken()).toBe('stored-jwt');
      // Should NOT call createJWT since we have a valid stored token
      expect(mockCreateJWT).not.toHaveBeenCalled();
    });
  });

  describe('loginWithEmail', () => {
    it('creates session and refreshes JWT', async () => {
      mockCreateEmailPasswordSession.mockResolvedValue({});
      mockGet.mockResolvedValue({
        $id: 'user-456',
        name: 'Bob',
        email: 'bob@example.com',
      });
      mockCreateJWT.mockResolvedValue({ jwt: 'email-jwt' });

      await provider.loginWithEmail('bob@example.com', 'password123');

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getUser()?.email).toBe('bob@example.com');
      expect(provider.getToken()).toBe('email-jwt');
    });

    it('sets ERROR status on failure', async () => {
      mockCreateEmailPasswordSession.mockRejectedValue(new Error('Invalid credentials'));

      await provider.loginWithEmail('bob@example.com', 'wrong');

      expect(provider.getStatus()).toBe(AuthStatus.ERROR);
    });
  });

  describe('signupWithEmail', () => {
    it('creates account, logs in, and refreshes JWT', async () => {
      mockCreate.mockResolvedValue({});
      mockCreateEmailPasswordSession.mockResolvedValue({});
      mockGet.mockResolvedValue({
        $id: 'user-789',
        name: 'charlie@example.com',
        email: 'charlie@example.com',
      });
      mockCreateJWT.mockResolvedValue({ jwt: 'signup-jwt' });

      await provider.signupWithEmail('charlie@example.com', 'newpassword');

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getToken()).toBe('signup-jwt');
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears session, JWT, and localStorage', async () => {
      // First login
      mockGet.mockResolvedValue({ $id: 'user-1', name: 'A', email: 'a@a.com' });
      mockCreateJWT.mockResolvedValue({ jwt: 'active-jwt' });
      await provider.init();

      expect(provider.getToken()).toBe('active-jwt');

      // Now logout
      mockDeleteSession.mockResolvedValue({});
      await provider.logout();

      expect(provider.getStatus()).toBe(AuthStatus.ANONYMOUS);
      expect(provider.getUser()).toBeUndefined();
      expect(provider.getToken()).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('cr-appwrite-jwt');
    });
  });

  describe('onChange', () => {
    it('notifies listeners on auth state changes', async () => {
      const listener = vi.fn();
      provider.onChange(listener);

      // listener is called immediately with current state
      expect(listener).toHaveBeenCalledWith(AuthStatus.LOADING, undefined);

      mockGet.mockResolvedValue({ $id: 'u1', name: 'X', email: 'x@x.com' });
      mockCreateJWT.mockResolvedValue({ jwt: 'jwt' });
      await provider.init();

      // Should have been called with AUTHENTICATED
      expect(listener).toHaveBeenCalledWith(
        AuthStatus.AUTHENTICATED,
        expect.objectContaining({ id: 'u1' })
      );
    });

    it('returns unsubscribe function', async () => {
      const listener = vi.fn();
      const unsub = provider.onChange(listener);
      listener.mockClear();

      unsub();

      mockGet.mockRejectedValue(new Error('no session'));
      await provider.init();

      // Should NOT have been called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
