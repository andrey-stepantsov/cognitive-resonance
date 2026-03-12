import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { CognitivePlatformProvider } from '@cr/core';
import { VSCodeStorageProvider } from './providers/VSCodeStorageProvider';
// The extension uses the anonymous provider because auth isn't natively supported yet.
import { AnonymousAuthProvider } from '@cr/backend';

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
