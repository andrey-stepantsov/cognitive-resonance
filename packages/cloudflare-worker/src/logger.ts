export class EdgeLogger {
  constructor(public reqId: string) {}

  info(msg: string, metadata: any = {}) {
    console.log(JSON.stringify({ level: 'info', msg, traceId: this.reqId, ...metadata }));
  }

  error(msg: string, error?: any, metadata: any = {}) {
    const errObj = error ? (error instanceof Error ? { error: error.message, stack: error.stack } : { error }) : {};
    console.error(JSON.stringify({ level: 'error', msg, traceId: this.reqId, ...errObj, ...metadata }));
  }
}

export function getEdgeLogger(request: Request): EdgeLogger {
  const reqId = request.headers.get('X-Request-Id') || crypto.randomUUID();
  return new EdgeLogger(reqId);
}
