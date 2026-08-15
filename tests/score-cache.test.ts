import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readScoreCache, readFreshScoreCache, writeScoreCache, isStale } from '../src/core/score-cache.js';

describe('score-cache', () => {
  const tmpDirs: string[] = [];
  const mkRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'vh-score-'));
    tmpDirs.push(root);
    return root;
  };
  afterAll(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  });

  it('round-trips a written cache', async () => {
    const root = mkRoot();
    await writeScoreCache(85, 100, 'B', root);
    const cache = await readScoreCache(root);
    expect(cache).not.toBeNull();
    expect(cache).toMatchObject({ score: 85, max: 100, grade: 'B' });
    expect(typeof cache!.timestamp).toBe('string');
  });

  it('returns null when no cache exists', async () => {
    const root = mkRoot();
    expect(await readScoreCache(root)).toBeNull();
    expect(await readFreshScoreCache(root)).toBeNull();
  });

  it('rejects malformed cache files', async () => {
    const root = mkRoot();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(root, '.vibe'), { recursive: true });
    writeFileSync(join(root, '.vibe', '.audit-cache.json'), '{"score": "nope"}', 'utf8');
    expect(await readScoreCache(root)).toBeNull();
  });

  it('marks old caches as stale and fresh ones as usable', async () => {
    const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(isStale({ score: 1, max: 2, grade: 'C', timestamp: oldTs })).toBe(true);
    expect(isStale({ score: 1, max: 2, grade: 'C', timestamp: new Date().toISOString() })).toBe(false);
    expect(isStale({ score: 1, max: 2, grade: 'C', timestamp: 'garbage' })).toBe(true);
  });

  it('readFreshScoreCache hides stale entries', async () => {
    const root = mkRoot();
    await writeScoreCache(10, 100, 'F', root);
    // Force staleness by rewriting the timestamp with an old date.
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(root, '.vibe'), { recursive: true });
    writeFileSync(
      join(root, '.vibe', '.audit-cache.json'),
      JSON.stringify({ score: 10, max: 100, grade: 'F', timestamp: new Date(Date.now() - 72 * 3600_000).toISOString() }),
      'utf8'
    );
    expect(await readFreshScoreCache(root)).toBeNull();
    expect(existsSync(join(root, '.vibe', '.audit-cache.json'))).toBe(true);
    // sanity: file content remains valid JSON
    expect(() => JSON.parse(readFileSync(join(root, '.vibe', '.audit-cache.json'), 'utf8'))).not.toThrow();
  });
});
