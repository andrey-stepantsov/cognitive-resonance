
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CognitivePlatformProvider, useCognitivePlatform } from '../providers/CognitivePlatformContext';
import { AuthStatus } from '../interfaces/IAuthProvider';

const TestComponent = () => {
  const { authStatus, isReady, showMigrationPrompt, migrateToCloud, skipMigration, auth } = useCognitivePlatform();
  if (!isReady) return <div data-testid="status">Loading</div>;
  
  return (
    <div>
      <div data-testid="status">{authStatus}</div>
      {showMigrationPrompt && <div data-testid="migration-prompt">Migration Prompt</div>}
      <button data-testid="migrate-btn" onClick={migrateToCloud}>Migrate</button>
      <button data-testid="skip-btn" onClick={skipMigration}>Skip</button>
      <button data-testid="login-btn" onClick={auth.login}>Login</button>
      <button data-testid="login-email-btn" onClick={() => auth.loginWithEmail?.('test@test.com', 'pass')}>Login Email</button>
      <button data-testid="signup-email-btn" onClick={() => auth.signupWithEmail?.('test@test.com', 'pass')}>Signup Email</button>
      <button data-testid="logout-btn" onClick={auth.logout}>Logout</button>
    </div>
  );
};

describe('CognitivePlatformContext', () => {
  let mockLocalAuth: any;
  let mockLocalStorage: any;
  let mockCloudAuth: any;
  let mockCloudStorage: any;
  let cloudAuthChangeCb: any = null;

  beforeEach(() => {
    mockLocalAuth = {
      init: vi.fn(),
      getStatus: vi.fn().mockReturnValue(AuthStatus.ANONYMOUS),
      getUser: vi.fn().mockReturnValue(undefined),
      onChange: vi.fn().mockReturnValue(vi.fn()),
      login: vi.fn(),
      logout: vi.fn()
    };
    
    mockLocalStorage = {
      init: vi.fn().mockResolvedValue(undefined),
      loadAllSessions: vi.fn().mockResolvedValue([]),
      loadGemsConfig: vi.fn().mockResolvedValue(null),
      clearAll: vi.fn().mockResolvedValue(undefined)
    };

    cloudAuthChangeCb = null;

    mockCloudAuth = {
      init: vi.fn(),
      getStatus: vi.fn().mockReturnValue(AuthStatus.ANONYMOUS),
      getUser: vi.fn().mockReturnValue(undefined),
      onChange: vi.fn().mockImplementation((cb) => {
        cloudAuthChangeCb = cb;
        return vi.fn();
      }),
      login: vi.fn(),
      loginWithEmail: vi.fn(),
      signupWithEmail: vi.fn(),
      logout: vi.fn()
    };

    mockCloudStorage = {
      init: vi.fn().mockResolvedValue(undefined),
      saveSession: vi.fn(),
      saveGemsConfig: vi.fn()
    };
  });

  const customRender = () => {
    return render(
      <CognitivePlatformProvider
        localAuth={mockLocalAuth}
        localStorage={mockLocalStorage}
        cloudAuth={mockCloudAuth}
        cloudStorage={mockCloudStorage}
      >
        <TestComponent />
      </CognitivePlatformProvider>
    );
  };

  it('renders loading state initially and then authenticates as local anonymous', async () => {
    customRender();
    expect(screen.getByTestId('status').textContent).toBe('Loading');
    
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(AuthStatus.ANONYMOUS);
    });
  });

  it('starts in cloud mode if cloudAuth is already authenticated', async () => {
    mockCloudAuth.getStatus.mockReturnValue(AuthStatus.AUTHENTICATED);
    customRender();
    
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(AuthStatus.AUTHENTICATED);
    });
  });

  it('intercepts login to swap to cloud tracking', async () => {
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.ANONYMOUS) throw new Error();
    });

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    expect(mockCloudAuth.login).toHaveBeenCalled();
  });

  it('intercepts loginWithEmail to swap to cloud tracking', async () => {
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.ANONYMOUS) throw new Error();
    });

    await act(async () => {
      screen.getByTestId('login-email-btn').click();
    });

    expect(mockCloudAuth.loginWithEmail).toHaveBeenCalledWith('test@test.com', 'pass');
  });

  it('intercepts signupWithEmail to swap to cloud tracking', async () => {
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.ANONYMOUS) throw new Error();
    });

    await act(async () => {
      screen.getByTestId('signup-email-btn').click();
    });

    expect(mockCloudAuth.signupWithEmail).toHaveBeenCalledWith('test@test.com', 'pass');
  });

  it('ignores local logout but triggers cloud logout', async () => {
    mockCloudAuth.getStatus.mockReturnValue(AuthStatus.AUTHENTICATED);
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.AUTHENTICATED) throw new Error();
    });

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    expect(mockCloudAuth.logout).toHaveBeenCalled();
  });

  it('handles migration prompt on cloud login', async () => {
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.ANONYMOUS) throw new Error();
    });

    // Mock local storage having sessions
    mockLocalStorage.loadAllSessions.mockResolvedValue([{ id: 's1', data: {} }]);
    mockLocalStorage.loadGemsConfig.mockResolvedValue({ gems: [] });

    // Trigger login to switch to cloudAuth
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await act(async () => {
      // Simulate cloud login success
      if (cloudAuthChangeCb) cloudAuthChangeCb(AuthStatus.AUTHENTICATED, { name: 'User' });
    });

    // Should show migration prompt
    await waitFor(() => {
      expect(screen.queryByTestId('migration-prompt')).not.toBeNull();
    });

    // Test migration process
    await act(async () => {
      screen.getByTestId('migrate-btn').click();
    });

    expect(screen.queryByTestId('migration-prompt')).toBeNull();
    expect(mockCloudStorage.saveSession).toHaveBeenCalledWith('s1', {});
    expect(mockLocalStorage.clearAll).toHaveBeenCalled();
  });

  it('can skip migration', async () => {
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.ANONYMOUS) throw new Error();
    });

    mockLocalStorage.loadAllSessions.mockResolvedValue([{ id: 's1', data: {} }]);
    
    // Trigger login to switch to cloudAuth
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await act(async () => {
      if (cloudAuthChangeCb) cloudAuthChangeCb(AuthStatus.AUTHENTICATED, { name: 'User' });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('migration-prompt')).not.toBeNull();
    });

    await act(async () => {
      screen.getByTestId('skip-btn').click();
    });

    expect(screen.queryByTestId('migration-prompt')).toBeNull();
    expect(mockCloudStorage.saveSession).not.toHaveBeenCalled();
    expect(mockLocalStorage.clearAll).not.toHaveBeenCalled(); // Skipping shouldn't clear local
  });

  it('falls back to local auth if cloud is logged out', async () => {
    mockCloudAuth.getStatus.mockReturnValue(AuthStatus.AUTHENTICATED);
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.AUTHENTICATED) throw new Error();
    });

    await act(async () => {
      if (cloudAuthChangeCb) cloudAuthChangeCb(AuthStatus.ANONYMOUS, undefined);
    });

    await waitFor(() => {
      // It stays anonymous
      expect(screen.getByTestId('status').textContent).toBe(AuthStatus.ANONYMOUS);
    });
  });

  it('throws error if hook is used outside provider', () => {
    // Suppress console error for this specific expected throw
    const originalError = console.error;
    console.error = vi.fn();
    expect(() => render(<TestComponent />)).toThrow('useCognitivePlatform must be used within a CognitivePlatformProvider');
    console.error = originalError;
  });
});
