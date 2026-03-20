import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthStatus } from '@cr/core';
import { CloudflareAuthProvider } from '../CloudflareAuthProvider';

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
      
      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getUser()).toEqual({
        id: 'cloud',
        name: 'Cloud User',
        email: 'cloud@edge',
      });
      expect(provider.getToken()).toBe('valid-token');
    });



    it('sets ANONYMOUS when no token exists', async () => {
      await provider.init();

      expect(provider.getStatus()).toBe(AuthStatus.ANONYMOUS);
    });
  });

  describe('connectCloud', () => {
    it('sets AUTHENTICATED on success and stores token', async () => {
      await provider.connectCloud('test-api-key');

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getUser()?.email).toBe('cloud@edge');
      expect(provider.getToken()).toBe('test-api-key');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('cr-cf-jwt', 'test-api-key');
    });
  });

  describe('connectLocal', () => {
    it('sets AUTHENTICATED on success and stores local-dev-token', async () => {
      await provider.connectLocal();

      expect(provider.getStatus()).toBe(AuthStatus.AUTHENTICATED);
      expect(provider.getToken()).toBe('local-dev-token');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('cr-cf-jwt', 'local-dev-token');
    });
  });

  describe('logout', () => {
    it('clears session, JWT, and localStorage', async () => {
      localStorageMock.setItem('cr-cf-jwt', 'active-jwt');
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

      localStorageMock.setItem('cr-cf-jwt', 'jwt');
      await provider.init();

      expect(listener).toHaveBeenCalledWith(
        AuthStatus.AUTHENTICATED,
        expect.objectContaining({ id: 'cloud' })
      );
    });
  });
});
