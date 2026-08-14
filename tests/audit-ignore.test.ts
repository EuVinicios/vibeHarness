import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAuditIgnores } from '../src/utils/audit-ignore.js';

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
