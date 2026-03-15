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
  CloudflareStorageProvider,
  initBackendEnvironment
} from '@cr/backend';

// Configure backend with Cloudflare Worker URL
initBackendEnvironment({
  gitRemoteUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL,
});

// Initialize platform providers
const localAuth = new AnonymousAuthProvider();
const localStorage = new LocalIndexedDBProvider();
const cloudAuth = new AnonymousAuthProvider();
const cloudStorage = new CloudflareStorageProvider();
cloudStorage.configure(
  import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '',
  import.meta.env.VITE_CR_API_KEY || ''
);

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
