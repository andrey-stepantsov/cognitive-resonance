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
  migrateToCloud: () => Promise<void>;
  skipMigration: () => void;
  showMigrationPrompt: boolean;
}

const CognitivePlatformContext = createContext<PlatformContextState | undefined>(undefined);

interface PlatformProviderProps {
  children: ReactNode;
  localAuth: IAuthProvider;
  localStorage: IStorageProvider;
  cloudAuth: IAuthProvider;
  cloudStorage: IStorageProvider;
}

export function CognitivePlatformProvider({ 
  children,
  localAuth,
  localStorage,
  cloudAuth,
  cloudStorage 
}: PlatformProviderProps) {
  
  // We strictly start with Local defaults
  const [activeAuth, setActiveAuth] = useState<IAuthProvider>(localAuth);
  const [activeStorage, setActiveStorage] = useState<IStorageProvider>(localStorage);
  
  const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.LOADING);
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);

  // Initialize both backing auth providers to check their implicit state
  useEffect(() => {
    let mounted = true;
    
    Promise.all([
      localAuth.init(),
      localStorage.init?.(),
      cloudAuth.init(),
      cloudStorage.init?.()
    ]).then(() => {
      if (!mounted) return;
      
      // If the cloud auth provider already has a session, we start in cloud mode
      if (cloudAuth.getStatus() === AuthStatus.AUTHENTICATED) {
        setActiveAuth(cloudAuth);
        setActiveStorage(cloudStorage);
        setAuthStatus(AuthStatus.AUTHENTICATED);
        setUser(cloudAuth.getUser());
      } else {
        // Otherwise, stay local
        setAuthStatus(AuthStatus.ANONYMOUS);
      }
      setIsReady(true);
    });

    return () => { mounted = false; };
  }, [localAuth, localStorage, cloudAuth, cloudStorage]);

  // Listen to changes on the *active* auth provider
  useEffect(() => {
    const unsubscribe = activeAuth.onChange((status, newUser) => {
      setAuthStatus(status);
      setUser(newUser);
      
      // The logic for migrating from Local -> Cloud
      if (activeAuth === cloudAuth && status === AuthStatus.AUTHENTICATED) {
        // We just successfully logged in
        // We need to check if there are local sessions to migrate
        checkMigrationNeed();
      }
      
      // If we logout of cloud, return to local
      if (activeAuth === cloudAuth && status === AuthStatus.ANONYMOUS) {
        setActiveAuth(localAuth);
        setActiveStorage(localStorage);
      }
    });
    
    return unsubscribe;
  }, [activeAuth, cloudAuth, localAuth, localStorage]);

  // Method exposed to the UI to explicitly trigger a login
  // We swap to tracking the Cloud auth provider
  const interceptLogin = async () => {
    setActiveAuth(cloudAuth);
    await cloudAuth.login();
  };

  const checkMigrationNeed = async () => {
    const localSessions = await localStorage.loadAllSessions();
    if (localSessions.length > 0) {
      // Trigger UI prompt to migrate
      setShowMigrationPrompt(true);
      // Wait for user action before actually swapping the active storage to cloud storage
    } else {
      // Nothing to migrate, quietly swap active storage
      setActiveStorage(cloudStorage);
    }
  };

  const migrateToCloud = async () => {
    setShowMigrationPrompt(false);
    
    // Perform bulk copy
    const localSessions = await localStorage.loadAllSessions();
    const localGems = await localStorage.loadGemsConfig();

    if (localGems) {
        await cloudStorage.saveGemsConfig(localGems);
    }

    for (const session of localSessions) {
      await cloudStorage.saveSession(session.id, session.data);
    }

    // Nuke local
    await localStorage.clearAll?.();
    
    // Switch to cloud
    setActiveStorage(cloudStorage);
  };

  const skipMigration = () => {
    setShowMigrationPrompt(false);
    // Explicitly do not nuke local, but future writes go to cloud
    setActiveStorage(cloudStorage);
  };

  const interceptLoginWithEmail = async (email: string, password: string) => {
    setActiveAuth(cloudAuth);
    if (cloudAuth.loginWithEmail) {
      await cloudAuth.loginWithEmail(email, password);
    }
  };

  const interceptSignupWithEmail = async (email: string, password: string) => {
    setActiveAuth(cloudAuth);
    if (cloudAuth.signupWithEmail) {
      await cloudAuth.signupWithEmail(email, password);
    }
  };

  // We wrap the active auth with our interception logic
  const proxyAuth: IAuthProvider = {
    ...activeAuth,
    login: async () => {
      if (activeAuth === localAuth) return interceptLogin();
      return activeAuth.login();
    },
    loginWithEmail: async (email, password) => {
      if (activeAuth === localAuth) return interceptLoginWithEmail(email, password);
      if (activeAuth.loginWithEmail) return activeAuth.loginWithEmail(email, password);
    },
    signupWithEmail: async (email, password) => {
      if (activeAuth === localAuth) return interceptSignupWithEmail(email, password);
      if (activeAuth.signupWithEmail) return activeAuth.signupWithEmail(email, password);
    },
    logout: async () => {
      if (activeAuth === cloudAuth) return activeAuth.logout();
    },
    init: async () => {}, // Already init
    getStatus: () => authStatus,
    getUser: () => user,
    onChange: (listener) => activeAuth.onChange(listener)
  };

  return (
    <CognitivePlatformContext.Provider value={{
      auth: proxyAuth,
      storage: activeStorage,
      authStatus,
      user,
      isReady,
      migrateToCloud,
      skipMigration,
      showMigrationPrompt
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
