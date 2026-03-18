import pino from 'pino';
import fs from 'fs';
import path from 'path';

const isServeCommand = process.argv.includes('serve');

const fileTransport = pino.transport({
  target: 'pino-roll',
  options: {
    file: path.resolve(process.cwd(), 'cr-daemon.log'),
    size: '5m',
    mkdir: true,
  }
});

const fileLogger = pino({ level: 'trace' }, fileTransport);

export const logger = {
  info: (msg: string, obj?: any) => {
    if (isServeCommand) {
      if (obj) fileLogger.info(obj, msg);
      else fileLogger.info(msg);
    } else {
      if (obj) console.log(msg, obj);
      else console.log(msg);
    }
  },
  log: (msg: string, obj?: any) => logger.info(msg, obj),
  warn: (msg: string, obj?: any) => {
    if (isServeCommand) {
      if (obj) fileLogger.warn(obj, msg);
      else fileLogger.warn(msg);
    } else {
      if (obj) console.warn(msg, obj);
      else console.warn(msg);
    }
  },
  error: (msg: string, obj?: any) => {
    if (isServeCommand) {
      if (obj) fileLogger.error(obj, msg);
      else fileLogger.error(msg);
    } else {
      if (obj) console.error(msg, obj);
      else console.error(msg);
    }
  },
  trace: (msg: string, obj?: any) => {
    if (obj) fileLogger.trace(obj, msg);
    else fileLogger.trace(msg);
    if (!isServeCommand && process.env.DEBUG) {
      if (obj) console.trace(msg, obj);
      else console.trace(msg);
    }
  }
};
