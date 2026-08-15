import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { projectRoot } from '../utils/fs.js';

/**
 * Zero-dependency clipboard copy (Constitution Law 6 — no new deps).
 * Uses the platform-native utility and falls back to writing the prompt to
 * `.vibe/prompt-last.txt` when no clipboard utility is available.
 */

export type ClipboardMethod = 'pbcopy' | 'wl-copy' | 'xclip' | 'xsel' | 'clip';

export type ClipboardResult =
  | { ok: true; method: ClipboardMethod }
  | { ok: false; method: 'file-fallback'; path: string };

interface Candidate {
  cmd: string;
  args: string[];
  method: ClipboardMethod;
}

function candidatesForPlatform(): Candidate[] {
  switch (process.platform) {
    case 'darwin':
      return [{ cmd: 'pbcopy', args: [], method: 'pbcopy' }];
    case 'win32':
      return [{ cmd: 'clip', args: [], method: 'clip' }];
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return [
        { cmd: 'wl-copy', args: [], method: 'wl-copy' },
        { cmd: 'xclip', args: ['-selection', 'clipboard'], method: 'xclip' },
        { cmd: 'xsel', args: ['--clipboard', '--input'], method: 'xsel' },
      ];
    default:
      return [];
  }
}

export type ClipboardRunner = (cmd: string, args: string[], input: string) => Promise<boolean>;

function runClipboardCommand(cmd: string, args: string[], input: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    child.stdin.on('error', () => {
      /* EPIPE — resolved via close event */
    });
    child.stdin.end(input);
  });
}

async function fileFallback(text: string, root: string): Promise<ClipboardResult> {
  const path = join(root, '.vibe', 'prompt-last.txt');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
  return { ok: false, method: 'file-fallback', path };
}

/** Copy text to the system clipboard; never throws. */
export async function copyToClipboard(
  text: string,
  root: string = projectRoot(),
  runner: ClipboardRunner = runClipboardCommand
): Promise<ClipboardResult> {
  for (const { cmd, args, method } of candidatesForPlatform()) {
    if (await runner(cmd, args, text)) {
      return { ok: true, method };
    }
  }
  return fileFallback(text, root);
}

/** Exported for tests: probes the real platform candidate list. */
export function clipboardCandidates(): readonly { cmd: string; args: string[]; method: ClipboardMethod }[] {
  return candidatesForPlatform();
}
