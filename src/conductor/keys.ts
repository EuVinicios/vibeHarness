import * as readline from 'node:readline';

/**
 * Single-key input via readline keypress events — zero dependencies.
 * Only enables raw mode on a real TTY stdin; callers must check
 * `stdinIsInteractive()` before invoking `awaitKey`.
 */

export interface KeyPress {
  name: string;
  ctrl: boolean;
  sequence: string;
}

export function stdinIsInteractive(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Wait for a single keypress matching one of the given key names
 * (e.g. ['enter', 'v', 'a', 'n', 'q']). Case-insensitive; ignores keys
 * not in the map. Returns the matched canonical key name.
 */
export function awaitKey(keys: string[], stream: NodeJS.ReadStream = process.stdin): Promise<string> {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));

  return new Promise((resolve) => {
    readline.emitKeypressEvents(stream);
    const wasRaw = stream.isRaw ?? false;
    if (stream.isTTY) stream.setRawMode(true);

    const onKey = (_ch: string, key?: KeyPress) => {
      const name = (key?.name ?? _ch ?? '').toLowerCase();
      if (name === 'c' && key?.ctrl) {
        // Ctrl+C always exits — mirrors conventional terminal behaviour.
        cleanup();
        process.exit(0);
      }
      if (!wanted.has(name)) return;
      cleanup();
      resolve(name);
    };

    const cleanup = () => {
      stream.removeListener('keypress', onKey);
      if (stream.isTTY) stream.setRawMode(wasRaw);
      // Pause so subsequent prompts/enquirer can re-attach cleanly.
      stream.pause();
    };

    stream.on('keypress', onKey);
    stream.resume();
  });
}
