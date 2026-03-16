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
  CloudflareAuthProvider,
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

// Cloudflare-backed cloud auth
const cloudAuth = new CloudflareAuthProvider(
  import.meta.env.VITE_CLOUDFLARE_WORKER_URL || 'http://localhost:8787'
);

const cloudStorage = new CloudflareStorageProvider();
cloudStorage.configure(
  import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '',
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
