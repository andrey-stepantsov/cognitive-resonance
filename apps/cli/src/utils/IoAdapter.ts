import * as readline from 'readline';

export interface InteractiveIo {
  setPrompt(prompt: string): void;
  prompt(preserveCursor?: boolean): void;
  onLine(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
  close(): void;
  clearLine(): void;
  cursorTo(pos: number): void;
  question(query: string): Promise<string>;
  questionHidden(query: string): Promise<string>;
}

export interface IoAdapter {
  print(msg: string): void;
  printError(msg: string): void;
  write(msg: string): void;
  setInterval(cb: () => void, ms: number): NodeJS.Timeout | any;
  clearInterval(id: any): void;
  setTimeout(cb: () => void, ms: number): NodeJS.Timeout | any;
  clearTimeout(id: any): void;
  createInteractive(completer?: (line: string) => [string[], string]): InteractiveIo;
}

export class DefaultIoAdapter implements IoAdapter {
  print(msg: string): void {
    console.log(msg);
  }

  printError(msg: string): void {
    console.error(msg);
  }

  write(msg: string): void {
    process.stdout.write(msg);
  }

  setInterval(cb: () => void, ms: number): NodeJS.Timeout {
    return setInterval(cb, ms);
  }

  clearInterval(id: NodeJS.Timeout): void {
    clearInterval(id);
  }

  setTimeout(cb: () => void, ms: number): NodeJS.Timeout {
    return setTimeout(cb, ms);
  }

  clearTimeout(id: NodeJS.Timeout): void {
    clearTimeout(id);
  }

  createInteractive(completer?: (line: string) => [string[], string]): InteractiveIo {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'cr> ',
      completer,
    });

    return {
      setPrompt: (p: string) => rl.setPrompt(p),
      prompt: (preserveCursor?: boolean) => rl.prompt(preserveCursor),
      onLine: (cb: (line: string) => void) => rl.on('line', cb),
      onClose: (cb: () => void) => rl.on('close', cb),
      close: () => rl.close(),
      clearLine: () => readline.clearLine(process.stdout, 0),
      cursorTo: (pos: number) => readline.cursorTo(process.stdout, pos),
      question: (query: string): Promise<string> => {
        return new Promise(resolve => rl.question(query, resolve));
      },
      questionHidden: (query: string): Promise<string> => {
        return new Promise((resolve) => {
          rl.question(query, (password) => {
            // @ts-ignore
            rl.stdoutMuted = false;
            console.log('');
            resolve(password);
          });
          // @ts-ignore
          rl.stdoutMuted = true;
          // @ts-ignore
          if (!rl._writeToOutput.hooked) {
             // @ts-ignore
             const oldWrite = rl._writeToOutput;
             // @ts-ignore
             rl._writeToOutput = function(str: string) {
                // @ts-ignore
                if (rl.stdoutMuted && str !== '\r\n' && str !== '\n') return;
                oldWrite.call(this, str);
             };
             // @ts-ignore
             rl._writeToOutput.hooked = true;
          }
        });
      }
    };
  }
}

export class MemoryIoAdapter implements IoAdapter {
  public output: string[] = [];
  public intervals: Array<NodeJS.Timeout> = [];
  public timeouts: Array<NodeJS.Timeout> = [];
  
  private lineCallbacks: Array<(line: string) => void> = [];
  public closeCallbacks: Array<() => void> = [];
  public isClosed: boolean = false;
  public lastPrompt: string = '';
  
  // Expose completer for tests
  public activeCompleter?: (line: string) => [string[], string];

  // Pending callbacks for programmatically responding to .question()
  public pendingQuestions: Array<(ans: string) => void> = [];

  print(msg: string): void {
    this.output.push(msg);
  }

  printError(msg: string): void {
    this.output.push(`[ERROR] ${msg}`);
  }

  write(msg: string): void {
    this.output.push(msg);
  }

  setInterval(cb: () => void, ms: number): NodeJS.Timeout {
    const id = setInterval(cb, ms);
    this.intervals.push(id);
    return id;
  }

  clearInterval(id: NodeJS.Timeout): void {
    clearInterval(id);
    this.intervals = this.intervals.filter(i => i !== id);
  }

  setTimeout(cb: () => void, ms: number): NodeJS.Timeout {
    const id = setTimeout(cb, ms);
    this.timeouts.push(id);
    return id;
  }

  clearTimeout(id: NodeJS.Timeout): void {
    clearTimeout(id);
    this.timeouts = this.timeouts.filter(t => t !== id);
  }

  createInteractive(completer?: (line: string) => [string[], string]): InteractiveIo {
    this.activeCompleter = completer;
    return {
      setPrompt: (p: string) => { this.lastPrompt = p; },
      prompt: (preserveCursor?: boolean) => {
          // You could optionally verify the prompt was expected
      },
      onLine: (cb: (line: string) => void) => {
        this.lineCallbacks.push(cb);
      },
      onClose: (cb: () => void) => {
        this.closeCallbacks.push(cb);
      },
      close: () => {
        this.isClosed = true;
        this.closeCallbacks.forEach(cb => cb());
        this.clearAllTimers();
      },
      clearLine: () => {},
      cursorTo: (pos: number) => {},
      question: (query: string): Promise<string> => {
         this.output.push(query);
         return new Promise(resolve => this.pendingQuestions.push(resolve));
      },
      questionHidden: (query: string): Promise<string> => {
         this.output.push(query);
         return new Promise(resolve => this.pendingQuestions.push(resolve));
      }
    };
  }

  // Helper for test simulation
  simulateLine(line: string) {
    if (this.isClosed) throw new Error("MemoryIoAdapter REPL is closed.");
    for (const cb of this.lineCallbacks) {
      cb(line);
    }
  }

  // Answer a pending question programmatically
  answerNextQuestion(answer: string) {
     const cb = this.pendingQuestions.shift();
     if (!cb) throw new Error("No pending questions.");
     cb(answer);
  }

  clearAllTimers() {
    this.intervals.forEach(id => clearInterval(id));
    this.intervals = [];
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts = [];
  }
}
