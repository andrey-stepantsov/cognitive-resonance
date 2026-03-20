import { CloudflareStorageProvider } from './providers/CloudflareStorageProvider';

export interface BackendConfig {
  gitRemoteUrl: string;
  apiKey: string;
}

export const globalBackendConfig: BackendConfig = {
  gitRemoteUrl: '',
  apiKey: '',
};

// Singleton Cloudflare storage provider (lazy initialized to prevent circular reference)
let _cloudflareStorage: CloudflareStorageProvider;
export const cloudflareStorage = new Proxy({} as CloudflareStorageProvider, {
  get(_target, prop, receiver) {
    if (!_cloudflareStorage) {
      _cloudflareStorage = new CloudflareStorageProvider();
    }
    const val = Reflect.get(_cloudflareStorage, prop, receiver);
    return typeof val === 'function' ? val.bind(_cloudflareStorage) : val;
  }
});

export function initBackendEnvironment(config: Partial<BackendConfig>) {
  Object.assign(globalBackendConfig, config);

  if (config.gitRemoteUrl) {
    cloudflareStorage.configure(config.gitRemoteUrl, config.apiKey);
  }
}
