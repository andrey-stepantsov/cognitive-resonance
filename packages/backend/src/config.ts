import { CloudflareStorageProvider } from './providers/CloudflareStorageProvider';

export interface BackendConfig {
  gitRemoteUrl: string;
  apiKey: string;
}

export const globalBackendConfig: BackendConfig = {
  gitRemoteUrl: '',
  apiKey: '',
};

// Singleton Cloudflare storage provider
export const cloudflareStorage = new CloudflareStorageProvider();

export function initBackendEnvironment(config: Partial<BackendConfig>) {
  Object.assign(globalBackendConfig, config);

  if (config.gitRemoteUrl) {
    cloudflareStorage.configure(config.gitRemoteUrl, config.apiKey);
  }
}
