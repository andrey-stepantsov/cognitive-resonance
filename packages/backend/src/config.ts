import { authService } from './services/AuthService';
import { gitRemoteSync } from './services/GitRemoteSync';

export interface BackendConfig {
  endpoint: string;
  project: string;
  dbId: string;
  collectionId: string;
  gitRemoteUrl: string;
}

export const globalBackendConfig: BackendConfig = {
  endpoint: '',
  project: '',
  dbId: '',
  collectionId: '',
  gitRemoteUrl: ''
};

export function initBackendEnvironment(config: Partial<BackendConfig>) {
  Object.assign(globalBackendConfig, config);

  if (config.endpoint && config.project) {
    authService.configure(config.endpoint, config.project);
  }
  
  if (config.gitRemoteUrl) {
    gitRemoteSync.configure(config.gitRemoteUrl);
  }
}
