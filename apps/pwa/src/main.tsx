import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { CognitivePlatformProvider } from '@cr/core';
import { 
  AnonymousAuthProvider, 
  LocalIndexedDBProvider, 
  AppwriteAuthProvider, 
  AppwriteStorageProvider 
} from '@cr/backend';

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
