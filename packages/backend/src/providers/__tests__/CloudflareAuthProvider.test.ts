import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthStatus } from '@cr/core';
import { CloudflareAuthProvider } from '../CloudflareAuthProvider';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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

describe('CloudflareAuthProvider', () => {
  let provider: CloudflareAuthProvider;
  const endpoint = 'http://localhost:8787';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    provider = new CloudflareAuthProvider(endpoint);
  });

  describe('init', () => {
    it('sets AUTHENTICATED when valid token is in localStorage', async () => {
      localStorageMock.setItem('cr-cf-jwt', 'valid-token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'user-123', name: 'Alice', email: 'alice@example.com' }
        })
      });

      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getUser()).toEqual({
        id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(provider.getToken()).toBe('valid-token');
      
      expect(mockFetch).toHaveBeenCalledWith(`${endpoint}/api/auth/me`, expect.objectContaining({
        headers: { Authorization: 'Bearer valid-token' }
      }));
    });

    it('sets ANONYMOUS when token is invalid', async () => {
      localStorageMock.setItem('cr-cf-jwt', 'invalid-token');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unauthorized' })
      });

      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.ANONYMOUS);
      expect(provider.getUser()).toBeUndefined();
      expect(provider.getToken()).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('cr-cf-jwt');
    });

    it('sets ANONYMOUS when no token exists', async () => {
      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.ANONYMOUS);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('loginWithEmail', () => {
    it('sets AUTHENTICATED on success and stores token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'new-jwt-token',
          user: { id: 'user-456', name: 'Bob', email: 'bob@example.com' }
        })
      });

      await provider.loginWithEmail('bob@example.com', 'password123');

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getUser()?.email).toBe('bob@example.com');
      expect(provider.getToken()).toBe('new-jwt-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('cr-cf-jwt', 'new-jwt-token');
      
      expect(mockFetch).toHaveBeenCalledWith(`${endpoint}/api/auth/login`, expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.com', password: 'password123' })
      }));
    });

    it('sets ERROR status on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' })
      });

      await provider.loginWithEmail('bob@example.com', 'wrong');

      expect(provider.getStatus()).toBe(AuthStatus.ERROR);
      expect(provider.getToken()).toBeNull();
    });
  });

  describe('signupWithEmail', () => {
    it('sets AUTHENTICATED on success and stores token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'signup-jwt',
          user: { id: 'user-789', name: 'charlie', email: 'charlie@example.com' }
        })
      });

      await provider.signupWithEmail('charlie@example.com', 'newpassword');

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getToken()).toBe('signup-jwt');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('cr-cf-jwt', 'signup-jwt');
    });
  });

  describe('logout', () => {
    it('clears session, JWT, and localStorage', async () => {
      // First setup state as logged in
      localStorageMock.setItem('cr-cf-jwt', 'active-jwt');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'u1', name: 'A', email: 'a@a.com' } })
      });
      await provider.init();

      expect(provider.getToken()).toBe('active-jwt');

      // Now logout
      await provider.logout();

      expect(provider.getStatus()).toBe(AuthStatus.ANONYMOUS);
      expect(provider.getUser()).toBeUndefined();
      expect(provider.getToken()).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('cr-cf-jwt');
    });
  });

  describe('onChange', () => {
    it('notifies listeners on auth state changes', async () => {
      const listener = vi.fn();
      provider.onChange(listener);

      expect(listener).toHaveBeenCalledWith(AuthStatus.LOADING, undefined);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 'u1', name: 'X', email: 'x@x.com' } })
      });
      localStorageMock.setItem('cr-cf-jwt', 'jwt');
      await provider.init();

      expect(listener).toHaveBeenCalledWith(
        AuthStatus.AUTHENTICATED,
        expect.objectContaining({ id: 'u1' })
      );
    });
  });
});
