import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CognitivePlatformProvider, useCognitivePlatform } from '../providers/CognitivePlatformContext';
import { AuthStatus } from '../interfaces/IAuthProvider';

const TestComponent = () => {
  const { authStatus, isReady, auth } = useCognitivePlatform();
  if (!isReady) return <div data-testid="status">Loading</div>;
  
  return (
    <div>
      <div data-testid="status">{authStatus}</div>
      <button data-testid="login-btn" onClick={auth.login}>Login</button>
      <button data-testid="logout-btn" onClick={auth.logout}>Logout</button>
    </div>
  );
};

describe('CognitivePlatformContext', () => {
  let mockAuth: any;
  let mockStorage: any;
  let authChangeCb: any = null;

  beforeEach(() => {
    authChangeCb = null;

    mockAuth = {
      init: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue(AuthStatus.ANONYMOUS),
      getUser: vi.fn().mockReturnValue(undefined),
      onChange: vi.fn().mockImplementation((cb) => {
        authChangeCb = cb;
        return vi.fn();
      }),
      login: vi.fn(),
      logout: vi.fn()
    };
    
    mockStorage = {
      init: vi.fn().mockResolvedValue(undefined)
    };
  });

  const customRender = () => {
    return render(
      <CognitivePlatformProvider auth={mockAuth} storage={mockStorage}>
        <TestComponent />
      </CognitivePlatformProvider>
    );
  };

  it('renders loading state initially and then authenticates as anonymous', async () => {
    customRender();
    expect(screen.getByTestId('status').textContent).toBe('Loading');
    
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(AuthStatus.ANONYMOUS);
    });
    
    expect(mockAuth.init).toHaveBeenCalled();
    expect(mockStorage.init).toHaveBeenCalled();
  });

  it('starts authenticated if auth provider is already authenticated', async () => {
    mockAuth.getStatus.mockReturnValue(AuthStatus.AUTHENTICATED);
    customRender();
    
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(AuthStatus.AUTHENTICATED);
    });
  });

  it('updates state when auth provider emits onChange', async () => {
    customRender();
    await waitFor(() => {
       if (screen.getByTestId('status').textContent !== AuthStatus.ANONYMOUS) throw new Error();
    });

    await act(async () => {
      if (authChangeCb) authChangeCb(AuthStatus.AUTHENTICATED, { name: 'Test User' });
    });

    expect(screen.getByTestId('status').textContent).toBe(AuthStatus.AUTHENTICATED);
  });

  it('throws error if hook is used outside provider', () => {
    // Suppress console error for this specific expected throw
    const originalError = console.error;
    console.error = vi.fn();
    expect(() => render(<TestComponent />)).toThrow('useCognitivePlatform must be used within a CognitivePlatformProvider');
    console.error = originalError;
  });
});
