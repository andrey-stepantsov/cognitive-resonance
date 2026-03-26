import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CR_DIR } from './api.js';

const isServeCommand = process.argv.includes('serve');

const fileTransport = pino.transport({
  target: 'pino-roll',
  options: {
    file: path.resolve(CR_DIR, 'cr-daemon.log'),
    size: '5m',
    mkdir: true,
  }
});

const fileLogger = pino({ level: 'trace' }, fileTransport);

export const logger = {
  info: (msg: string, obj?: any) => {
    const formatted = typeof msg === 'string' ? chalk.blue(msg) : msg;
    if (isServeCommand) {
      if (obj) fileLogger.info(obj, msg);
      else fileLogger.info(msg);
    } else {
      if (obj) console.log(formatted, obj);
      else console.log(formatted);
    }
  },
  log: (msg: string, obj?: any) => logger.info(msg, obj),
  warn: (msg: string, obj?: any) => {
    const formatted = typeof msg === 'string' ? chalk.yellow(msg) : msg;
    if (isServeCommand) {
      if (obj) fileLogger.warn(obj, msg);
      else fileLogger.warn(msg);
    } else {
      if (obj) console.warn(formatted, obj);
      else console.warn(formatted);
    }
  },
  error: (msg: string, obj?: any) => {
    const formatted = typeof msg === 'string' ? chalk.red(msg) : msg;
    if (isServeCommand) {
      if (obj) fileLogger.error(obj, msg);
      else fileLogger.error(msg);
    } else {
      if (obj) console.error(formatted, obj);
      else console.error(formatted);
    }
  },
  trace: (msg: string, obj?: any) => {
    const formatted = typeof msg === 'string' ? chalk.gray(msg) : msg;
    if (obj) fileLogger.trace(obj, msg);
    else fileLogger.trace(msg);
    if (!isServeCommand && process.env.DEBUG) {
      if (obj) console.trace(formatted, obj);
      else console.trace(formatted);
    }
  }
};

