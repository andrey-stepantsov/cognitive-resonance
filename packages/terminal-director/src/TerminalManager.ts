import { TerminalInstance, TerminalInstanceOptions } from './TerminalInstance.js';

export class TerminalManager {
  private instances: Map<string, TerminalInstance> = new Map();
  private pendingPrefix: Map<string, boolean> = new Map();

  public spawn(id: string, command: string, args: string[], options?: TerminalInstanceOptions): TerminalInstance {
    if (this.instances.has(id)) {
      throw new Error(`Terminal instance with id ${id} already exists`);
    }

    const instance = new TerminalInstance(id, command, args, options);
    this.pendingPrefix.set(id, true);
    
    instance.onData((data) => {
      // 36m is Cyan, 32m is Green, 33m is Yellow, 35m is Magenta
      // We will hash the id simple to get a color roughly
      const colorCode = [32, 33, 34, 35, 36][id.length % 5];
      const prefix = `\x1b[${colorCode}m[${id}]\x1b[0m `;
      
      let out = '';
      
      for (let i = 0; i < data.length; i++) {
        if (this.pendingPrefix.get(id)) {
          out += prefix;
          this.pendingPrefix.set(id, false);
        }
        
        out += data[i];
        
        if (data[i] === '\n') {
          this.pendingPrefix.set(id, true);
        }
      }
      
      process.stdout.write(out);
    });
    
    this.instances.set(id, instance);
    return instance;
  }

  public get(id: string): TerminalInstance | undefined {
    return this.instances.get(id);
  }

  public killAll() {
    for (const instance of this.instances.values()) {
      instance.kill();
    }
    this.instances.clear();
  }
}
