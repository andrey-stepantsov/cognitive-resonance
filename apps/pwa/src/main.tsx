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
  AppwriteAuthProvider,
  LocalIndexedDBProvider, 
  CloudflareStorageProvider,
  initBackendEnvironment,
  gitRemoteSync
} from '@cr/backend';

// Configure backend with Cloudflare Worker URL
initBackendEnvironment({
  gitRemoteUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL,
});

// Initialize platform providers
const localAuth = new AnonymousAuthProvider();
const localStorage = new LocalIndexedDBProvider();

// Appwrite-backed cloud auth
const cloudAuth = new AppwriteAuthProvider(
  import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1',
  import.meta.env.VITE_APPWRITE_PROJECT || 'cognitive-resonance',
);

const cloudStorage = new CloudflareStorageProvider();
cloudStorage.configure(
  import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '',
  import.meta.env.VITE_CR_API_KEY || ''
);
// Wire dynamic JWT from Appwrite into CF storage and git sync requests
cloudStorage.configureAuth(() => cloudAuth.getToken());
gitRemoteSync.configureAuth(() => cloudAuth.getToken());

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
