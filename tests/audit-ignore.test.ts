import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  loadAuditIgnores,
  loadAuditIgnoreEntries,
  isOverlyBroadPattern,
  resolveAuditIgnoreFiles,
} from '../src/utils/audit-ignore.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-ignore-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('loadAuditIgnores', () => {
  it('returns empty list when no .vibe/auditignore exists', async () => {
    expect(await loadAuditIgnores()).toEqual([]);
  });

  it('filters comments and blank lines', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(
      join(tmpDir, '.vibe', 'auditignore'),
      '# comment\n\ntests/foo.test.ts\n  src/fixtures/**  \n',
      'utf8'
    );
    expect(await loadAuditIgnores()).toEqual(['tests/foo.test.ts', 'src/fixtures/**']);
  });

  it('returns empty list on read error (never breaks the audit)', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    // Directory where the file is expected → read fails → graceful []
    await mkdir(join(tmpDir, '.vibe', 'auditignore'), { recursive: true });
    expect(await loadAuditIgnores()).toEqual([]);
  });
});

describe('loadAuditIgnoreEntries (v0.9 — inline reasons)', () => {
  it('parses pattern + inline reason', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(
      join(tmpDir, '.vibe', 'auditignore'),
      'tests/foo.test.ts  # intentional fixture\nsrc/x.ts\n',
      'utf8'
    );
    const entries = await loadAuditIgnoreEntries();
    expect(entries).toEqual([
      { pattern: 'tests/foo.test.ts', reason: 'intentional fixture' },
      { pattern: 'src/x.ts' },
    ]);
    // Legacy consumer keeps working
    expect(await loadAuditIgnores()).toEqual(['tests/foo.test.ts', 'src/x.ts']);
  });

  it('an inline comment that eats the whole line is dropped, not an empty pattern', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), '# only a comment\n', 'utf8');
    expect(await loadAuditIgnoreEntries()).toEqual([]);
  });
});

describe('isOverlyBroadPattern (v0.9 — audit kill-switch detection)', () => {
  it('flags whole-tree and whole-extension patterns', () => {
    for (const p of ['**', '*', '**/*', '**/**', '**/*.ts', '**/*.{ts,tsx}', 'src/**', 'app/*']) {
      expect(isOverlyBroadPattern(p)).toBe(true);
    }
  });

  it('allows narrow, legitimate exclusions', () => {
    for (const p of ['tests/foo.test.ts', 'src/fixtures/**', 'docs/generated/api.md', '!**/keep.ts']) {
      expect(isOverlyBroadPattern(p)).toBe(false);
    }
  });
});

describe('resolveAuditIgnoreFiles (v0.9)', () => {
  it('resolves globs to concrete files', async () => {
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'a.ts'), 'x', 'utf8');
    await writeFile(join(tmpDir, 'src', 'b.ts'), 'x', 'utf8');
    const set = await resolveAuditIgnoreFiles(['src/*.ts']);
    expect(set.size).toBe(2);
    expect(set.has(join(tmpDir, 'src', 'a.ts'))).toBe(true);
  });

  it('broken/negated patterns match nothing without throwing', async () => {
    const set = await resolveAuditIgnoreFiles(['!keep.ts', '[[[invalid']);
    expect(set.size).toBe(0);
  });
});
