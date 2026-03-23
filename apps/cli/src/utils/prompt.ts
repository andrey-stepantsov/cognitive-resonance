import * as readline from 'readline';

// Helper to reliably read from stdin if piped
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''; // No data piped in
  }
  return new Promise((resolve, reject) => {
    let data = '';
    // Safety fallback: if EOF is structurally omitted (like in nested npx execution), resolve anyway
    const safetyTimer = setTimeout(() => resolve(data.trim()), 250);
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(safetyTimer); resolve(data.trim()); });
    process.stdin.on('error', err => { clearTimeout(safetyTimer); reject(err); });
  });
}

// Interactive secure password prompt with TTY muting
export function askSecure(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (password) => {
      // @ts-ignore
      rl.stdoutMuted = false;
      console.log(''); // newline after entry
      resolve(password);
    });
    
    // Mute stdout AFTER the question text has been written to the console
    // @ts-ignore
    rl.stdoutMuted = true;
  });
}

// TTY muter hook utility for standard readline interfaces
export function hookStdoutMute(rl: readline.Interface) {
  // @ts-ignore
  rl._writeToOutput = function _writeToOutput(stringToWrite: string) {
    // @ts-ignore
    if (rl.stdoutMuted && stringToWrite !== '\r\n' && stringToWrite !== '\n') return;
    // @ts-ignore
    readline.Interface.prototype._writeToOutput.call(this, stringToWrite);
  };
}
