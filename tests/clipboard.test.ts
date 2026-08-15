import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyToClipboard,
  clipboardCandidates,
  type ClipboardRunner,
} from '../src/conductor/clipboard.js';

describe('clipboardCandidates', () => {
  it('maps each platform to its native utility (probed per platform)', () => {
    const candidates = clipboardCandidates();
    const cmds = candidates.map((c) => c.cmd);
    const known: Record<string, string[]> = {
      darwin: ['pbcopy'],
      win32: ['clip'],
      linux: ['wl-copy', 'xclip', 'xsel'],
    };
    expect(cmds).toEqual(known[process.platform] ?? []);
  });
});

describe('copyToClipboard', () => {
  const tmpDirs: string[] = [];
  const mkRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'vh-clip-'));
    tmpDirs.push(root);
    return root;
  };
  afterAll(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  });

  it('uses the first candidate whose runner succeeds', async () => {
    const calls: string[] = [];
    const runner: ClipboardRunner = async (cmd) => {
      calls.push(cmd);
      return true;
    };
    const result = await copyToClipboard('hello prompt', mkRoot(), runner);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(clipboardCandidates()[0].cmd);
  });

  it('tries the next candidate when the first fails', async () => {
    const calls: string[] = [];
    const all = clipboardCandidates();
    const last = all[all.length - 1].cmd;
    const runner: ClipboardRunner = async (cmd) => {
      calls.push(cmd);
      return cmd === last;
    };
    const result = await copyToClipboard('texto', mkRoot(), runner);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.method).toBe(last);
    expect(calls).toEqual(all.map((c) => c.cmd));
  });

  it('falls back to writing .vibe/prompt-last.txt when every candidate fails', async () => {
    const runner: ClipboardRunner = async () => false;
    const root = mkRoot();
    const result = await copyToClipboard('prompt de contingência', root, runner);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.method).toBe('file-fallback');
      expect(result.path).toBe(join(root, '.vibe', 'prompt-last.txt'));
      const saved = readFileSync(join(root, '.vibe', 'prompt-last.txt'), 'utf8');
      expect(saved).toBe('prompt de contingência');
    }
  });

  it('passes the text to the runner stdin-bound input', async () => {
    const seen: { cmd: string; args: string[]; input: string }[] = [];
    const runner: ClipboardRunner = async (cmd, args, input) => {
      seen.push({ cmd, args, input });
      return true;
    };
    await copyToClipboard('o prompt', mkRoot(), runner);
    expect(seen[0].input).toBe('o prompt');
  });
});
