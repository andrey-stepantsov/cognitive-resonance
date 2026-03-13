import { StrictMode } from 'react';
import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
}
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { CognitivePlatformProvider } from '@cr/core';
import { 
  AnonymousAuthProvider, 
  LocalIndexedDBProvider, 
  AppwriteAuthProvider, 
  AppwriteStorageProvider,
  initBackendEnvironment
} from '@cr/backend';

// Inject environment variables explicitly for Vite string replacement
initBackendEnvironment({
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT,
  project: import.meta.env.VITE_APPWRITE_PROJECT,
  dbId: import.meta.env.VITE_APPWRITE_DB_ID,
  collectionId: import.meta.env.VITE_APPWRITE_SESSIONS_COLLECTION_ID,
  gitRemoteUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL,
});

// Initialize platform providers
const localAuth = new AnonymousAuthProvider();
const localStorage = new LocalIndexedDBProvider();
const cloudAuth = new AppwriteAuthProvider();
const cloudStorage = new AppwriteStorageProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CognitivePlatformProvider
      localAuth={localAuth}
      localStorage={localStorage}
      cloudAuth={cloudAuth}
      cloudStorage={cloudStorage}
    >
      <App />
    </CognitivePlatformProvider>
  </StrictMode>,
);
