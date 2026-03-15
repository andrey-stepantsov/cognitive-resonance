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
import { initBackendEnvironment, CloudflareStorageProvider } from '@cr/backend';
import { ExtensionAuthProvider } from './providers/ExtensionAuthProvider';

// Configure backend with Cloudflare Worker URL
initBackendEnvironment({
  gitRemoteUrl: import.meta.env.VITE_CLOUDFLARE_WORKER_URL,
});

const authProvider = new ExtensionAuthProvider();
const localStorageProvider = new VSCodeStorageProvider();
const cloudStorage = new CloudflareStorageProvider();
cloudStorage.configure(
  import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '',
  import.meta.env.VITE_CR_API_KEY || ''
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CognitivePlatformProvider
      localAuth={authProvider}
      localStorage={localStorageProvider}
      cloudAuth={authProvider}
      cloudStorage={cloudStorage}
    >
      <App />
    </CognitivePlatformProvider>
  </StrictMode>
);
