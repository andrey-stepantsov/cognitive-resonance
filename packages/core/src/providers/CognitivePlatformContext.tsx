import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthStatus } from '../interfaces/IAuthProvider';
import type { IAuthProvider, UserProfile } from '../interfaces/IAuthProvider';
import type { IStorageProvider } from '../interfaces/IStorageProvider';

interface PlatformContextState {
  auth: IAuthProvider;
  storage: IStorageProvider;
  authStatus: AuthStatus;
  user?: UserProfile;
  isReady: boolean;
}

const CognitivePlatformContext = createContext<PlatformContextState | undefined>(undefined);

interface PlatformProviderProps {
  children: ReactNode;
  auth: IAuthProvider;
  storage: IStorageProvider;
}

export function CognitivePlatformProvider({ 
  children,
  auth,
  storage
}: PlatformProviderProps) {
  
  const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.LOADING);
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);

  // Initialize providers
  useEffect(() => {
    let mounted = true;
    
    Promise.all([
      auth.init(),
      storage.init?.()
    ]).then(() => {
      if (!mounted) return;
      
      setAuthStatus(auth.getStatus());
      setUser(auth.getUser());
      setIsReady(true);
    });

    return () => { mounted = false; };
  }, [auth, storage]);

  // Listen to changes on the auth provider
  useEffect(() => {
    const unsubscribe = auth.onChange((status, newUser) => {
      setAuthStatus(status);
      setUser(newUser);
    });
    
    return unsubscribe;
  }, [auth]);

  return (
    <CognitivePlatformContext.Provider value={{
      auth,
      storage,
      authStatus,
      user,
      isReady
    }}>
      {children}
    </CognitivePlatformContext.Provider>
  );
}

export function useCognitivePlatform() {
  const context = useContext(CognitivePlatformContext);
  if (context === undefined) {
    throw new Error('useCognitivePlatform must be used within a CognitivePlatformProvider');
  }
  return context;
}
