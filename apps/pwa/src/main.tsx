import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { CognitivePlatformProvider } from '@cr/core';
import { 
  AnonymousAuthProvider, 
  LocalIndexedDBProvider, 
  MockCloudAuthProvider, 
  MockCloudStorageProvider 
} from '@cr/backend';

// Initialize platform providers
const localAuth = new AnonymousAuthProvider();
const localStorage = new LocalIndexedDBProvider();
const cloudAuth = new MockCloudAuthProvider();
const cloudStorage = new MockCloudStorageProvider();

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
