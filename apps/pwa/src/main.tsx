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
  CloudflareAuthProvider,
  LocalIndexedDBProvider, 
  CloudflareStorageProvider,
  initBackendEnvironment,
  gitRemoteSync
} from '@cr/backend';

const isLocalMode = typeof window !== 'undefined' && window.localStorage?.getItem('cr_local_mode') === 'true';
const backendUrl = isLocalMode 
  ? 'http://localhost:3000' 
  : (import.meta.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787');

// Configure backend with correct URL
initBackendEnvironment({
  gitRemoteUrl: backendUrl,
});

// Initialize platform providers
const localStorage = new LocalIndexedDBProvider();

// Cloudflare-backed cloud auth
const cloudAuth = new CloudflareAuthProvider(backendUrl);

// For localAuth, we also use the CloudflareAuthProvider now to enforce security
const localAuth = cloudAuth;

const cloudStorage = new CloudflareStorageProvider();
cloudStorage.configure(
  backendUrl,
  import.meta.env.VITE_CR_API_KEY || ''
);
// Wire dynamic JWT from CloudflareAuth into CF storage and git sync requests
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
