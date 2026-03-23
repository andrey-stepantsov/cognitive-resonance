import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export interface TerminalInstanceOptions {
  cwd?: string;
  env?: Record<string, string>;
}

export class TerminalInstance {
  private childProcess: ChildProcessWithoutNullStreams;
  private outputBuffer: string = '';
  public readonly id: string;
  private onDataCallbacks: ((data: string) => void)[] = [];

  constructor(id: string, command: string, args: string[], options?: TerminalInstanceOptions) {
    this.id = id;
    
    // We use child_process.spawn to bypass node-pty posix_spawnp crashes
    this.childProcess = spawn(command, args, {
      cwd: options?.cwd || process.cwd(),
      env: (options?.env || process.env) as Record<string, string>,
      shell: true // Allows native path resolution
    });

    this.childProcess.stdout.on('data', (data) => {
      const str = data.toString();
      this.outputBuffer += str;
      for (const cb of this.onDataCallbacks) {
        cb(str);
      }
    });

    this.childProcess.stderr.on('data', (data) => {
      const str = data.toString();
      this.outputBuffer += str;
      for (const cb of this.onDataCallbacks) {
        cb(str);
      }
    });
  }

  public onData(cb: (data: string) => void) {
    this.onDataCallbacks.push(cb);
  }

  public write(text: string) {
    this.childProcess.stdin.write(text);
  }

  public async typeHuman(text: string, charDelayMs: number = 30) {
    for (const char of text) {
      this.write(char);
      await new Promise(resolve => setTimeout(resolve, charDelayMs));
    }
  }

  public async waitForStdout(pattern: string | RegExp, timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const match = typeof pattern === 'string' 
          ? this.outputBuffer.includes(pattern)
          : pattern.test(this.outputBuffer);
          
        if (match) {
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for stdout pattern: ${pattern} in terminal ${this.id}`));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  public getBuffer(): string {
    return this.outputBuffer;
  }

  public clearBuffer(): void {
    this.outputBuffer = '';
  }

  public waitForExit(): Promise<number | null> {
    return new Promise((resolve) => {
      if (this.childProcess.exitCode !== null || this.childProcess.signalCode !== null) {
        resolve(this.childProcess.exitCode);
      } else {
        this.childProcess.on('exit', (code) => resolve(code));
      }
    });
  }

  public kill() {
    this.childProcess.kill();
  }
}
