import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'trace').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('logs to console when not serve command', async () => {
    process.argv = ['node', 'script.js'];
    const { logger } = await import('../src/utils/logger');
    
    logger.info('test info');
    expect(console.log).toHaveBeenCalledWith('test info');
    
    logger.info('test info src', { a: 1 });
    expect(console.log).toHaveBeenCalledWith('test info src', { a: 1 });

    logger.log('test log');
    expect(console.log).toHaveBeenCalledWith('test log');

    logger.warn('test warn');
    expect(console.warn).toHaveBeenCalledWith('test warn');

    logger.warn('test warn src', { a: 1 });
    expect(console.warn).toHaveBeenCalledWith('test warn src', { a: 1 });

    logger.error('test error');
    expect(console.error).toHaveBeenCalledWith('test error');

    logger.error('test error src', { a: 1 });
    expect(console.error).toHaveBeenCalledWith('test error src', { a: 1 });
  });

  it('logs to file when serve command is used', async () => {
    process.argv = ['node', 'script.js', 'serve'];
    const { logger } = await import('../src/utils/logger');
    
    logger.info('test info serve');
    logger.info('test info serve', { a: 1 });
    logger.warn('test warn serve');
    logger.warn('test warn serve', { a: 1 });
    logger.error('test error serve');
    logger.error('test error serve', { a: 1 });
    logger.trace('test trace serve');
    logger.trace('test trace serve', { a: 1 });
    
    // Console should not be called since pino goes to file
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs trace to console when DEBUG is set and not serve command', async () => {
    process.argv = ['node', 'script.js'];
    process.env.DEBUG = '1';
    const { logger } = await import('../src/utils/logger');
    
    logger.trace('test trace debug');
    expect(console.trace).toHaveBeenCalledWith('test trace debug');

    logger.trace('test trace debug', { a: 1 });
    expect(console.trace).toHaveBeenCalledWith('test trace debug', { a: 1 });
  });
});
