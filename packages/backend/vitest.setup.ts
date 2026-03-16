/**
 * Vitest global setup for the backend package.
 *
 * Polyfills browser APIs that lightning-fs (used by isomorphic-git)
 * expects to exist. Without these, lightning-fs throws unhandled rejections
 * in the Node test environment.
 */
if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = {
    locks: undefined,  // lightning-fs checks navigator.locks
    storage: {
      estimate: async () => ({ usage: 0, quota: 0 }),
      persist: async () => true,
    },
  };
}

// Suppress unhandled rejections from lightning-fs DefaultBackend.init
// which tries to use browser APIs (indexedDB, navigator.locks) that
// don't exist in Node. These are async side-effects from isomorphic-git
// module initialization, not test failures.
const originalListeners = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason: any) => {
  const msg = String(reason?.message || reason || '');
  if (msg.includes('navigator') || msg.includes('indexedDB') || msg.includes('IDBFactory')) {
    // Suppress lightning-fs browser API errors in Node
    return;
  }
  // Re-throw other unhandled rejections
  for (const listener of originalListeners) {
    (listener as any)(reason);
  }
});
