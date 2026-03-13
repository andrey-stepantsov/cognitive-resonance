import { StrictMode } from 'react';
import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Buffer = window.Buffer || Buffer;
}
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { CognitivePlatformProvider } from '@cr/core';
import { VSCodeStorageProvider } from './providers/VSCodeStorageProvider';
// The extension uses the anonymous provider because auth isn't natively supported yet.
import { AnonymousAuthProvider, initBackendEnvironment } from '@cr/backend';

// Inject environment variables explicitly for Vite string replacement
initBackendEnvironment({
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT,
  project: import.meta.env.VITE_APPWRITE_PROJECT,
  dbId: import.meta.env.VITE_APPWRITE_DB_ID,
  collectionId: import.meta.env.VITE_APPWRITE_SESSIONS_COLLECTION_ID,
  gitRemoteUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL,
});

const authProvider = new AnonymousAuthProvider();
const storageProvider = new VSCodeStorageProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CognitivePlatformProvider
      localAuth={authProvider}
      localStorage={storageProvider}
      cloudAuth={authProvider} // Cloud mock disabled in VSCode version by default
      cloudStorage={storageProvider}
    >
      <App />
    </CognitivePlatformProvider>
  </StrictMode>
);
