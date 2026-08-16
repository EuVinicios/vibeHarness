import { mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSafe, hasSymlinkedAncestorSegment } from '../src/utils/fs.js';

describe('writeFileSafe — temp-file TOCTOU guard (v0.8.3)', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to write through a planted temp-file symlink (predictable tmp name)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-fs-'));
    dirs.push(dir);
    const target = join(dir, 'config.json');
    const outside = join(dir, 'outside.txt');
    writeFileSync(outside, 'precious\n');
    // Attacker with write access pre-creates the exact tmp path as a symlink.
    symlinkSync(outside, `${target}.tmp-${process.pid}`);

    const written = await writeFileSafe(target, '{"evil":true}', { overwrite: true, quiet: true });
    expect(written).toBe(false);
    expect(readFileSync(outside, 'utf8')).toBe('precious\n');
    expect(existsSync(target)).toBe(false);
  });

  it('reuses a stale plain temp file from a crashed run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-fs-'));
    dirs.push(dir);
    const target = join(dir, 'config.json');
    writeFileSync(`${target}.tmp-${process.pid}`, 'stale garbage');

    const written = await writeFileSafe(target, 'fresh content', { overwrite: true, quiet: true });
    expect(written).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('fresh content');
  });
});

describe('hasSymlinkedAncestorSegment (v0.8.3)', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('detects a symlinked directory segment between anchor and file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-fs-'));
    dirs.push(dir);
    symlinkSync(join(dir, 'elsewhere'), join(dir, '.cursor'));

    expect(await hasSymlinkedAncestorSegment(dir, '.cursor/rules/vibeharness.mdc')).toBe(true);
    expect(await hasSymlinkedAncestorSegment(dir, '.cursor/mcp.json')).toBe(true);
  });

  it('passes plain directories and not-yet-created paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-fs-'));
    dirs.push(dir);

    expect(await hasSymlinkedAncestorSegment(dir, '.qwen/settings.json')).toBe(false);
    expect(await hasSymlinkedAncestorSegment(dir, 'CLAUDE.md')).toBe(false);
    expect(await hasSymlinkedAncestorSegment(dir, 'deep/new/path/file.md')).toBe(false);
  });
});
