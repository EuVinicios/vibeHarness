import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packContext } from '../src/packager/index.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-pack-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('packContext', () => {
  it('creates the output file', async () => {
    await writeFile(join(tmpDir, 'index.ts'), 'export const greeting = "hello";\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).toContain('VibeHarness Context Pack');
  });

  it('includes source file content', async () => {
    await writeFile(join(tmpDir, 'main.ts'), 'export function add(a: number, b: number) { return a + b; }\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).toContain('main.ts');
    expect(content).toContain('add');
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('redacts Stripe-like secret patterns', async () => {
    // Build the key pattern at runtime so the literal never appears in source.
    // Must be ≥ 24 chars after prefix to match the detection regex.
    const prefix = 'sk' + '_' + 'live' + '_';
    const fakeKey = prefix + 'abcdefghijklmnopqrstuvwxyz'; // 26 chars — matches regex
    await writeFile(
      join(tmpDir, 'config.ts'),
      `export const stripeKey = "${fakeKey}";\n`,
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    // The redacted value should not contain the original fake key
    expect(content).not.toContain(fakeKey);
    expect(result.redactedCount).toBeGreaterThan(0);
  });

  it('skips non-text file extensions not in the text whitelist', async () => {
    // .db is not in TEXT_EXTENSIONS and not in the binary-exclude glob patterns,
    // so it reaches the extension check and is counted as skipped binary.
    await writeFile(join(tmpDir, 'data.db'), 'binary-ish\n', 'utf8');
    await writeFile(join(tmpDir, 'app.ts'), 'const x = 1;\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    expect(result.skippedBinary).toBeGreaterThan(0);
  });

  it('returns correct metadata', async () => {
    await writeFile(join(tmpDir, 'util.ts'), 'export const PI = 3.14;\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    expect(typeof result.fileCount).toBe('number');
    expect(typeof result.redactedCount).toBe('number');
    expect(typeof result.totalBytes).toBe('number');
    expect(typeof result.skippedBinary).toBe('number');
  });
});
