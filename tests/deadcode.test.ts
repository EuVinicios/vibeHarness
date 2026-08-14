import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanDeadCode } from '../src/scanners/deadcode.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-deadcode-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

function manyConsoleLogs(count: number): string {
  return Array.from({ length: count }, (_, i) => `console.log('line ${i}');`).join('\n') + '\n';
}

describe('scanDeadCode — console.log', () => {
  it('penalises console.log in non-CLI projects (low finding)', async () => {
    await writeFile(join(tmpDir, 'package.json'), `{"name":"webapp"}\n`, 'utf8');
    await writeFile(join(tmpDir, 'app.ts'), manyConsoleLogs(20), 'utf8');
    const result = await scanDeadCode();
    const logFindings = result.findings.filter((f) => f.message.includes('console.log'));
    expect(logFindings).toHaveLength(1);
    expect(logFindings[0].severity).toBe('low');
    expect(result.score).toBeLessThan(result.maxScore);
  });

  it('treats console.log as advisory (info, no deduction) in CLI projects', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      `{"name":"cli-tool","bin":{"cli-tool":"./dist/cli.js"}}\n`,
      'utf8'
    );
    await writeFile(join(tmpDir, 'cli.ts'), manyConsoleLogs(20), 'utf8');
    const result = await scanDeadCode();
    const logFindings = result.findings.filter((f) => f.message.includes('console.log'));
    expect(logFindings).toHaveLength(1);
    expect(logFindings[0].severity).toBe('info');
    expect(result.score).toBe(result.maxScore);
  });

  it('honours .vibe/auditignore exclusions', async () => {
    await writeFile(join(tmpDir, 'package.json'), `{"name":"webapp"}\n`, 'utf8');
    await writeFile(join(tmpDir, 'verbose.ts'), manyConsoleLogs(20), 'utf8');
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'verbose.ts\n', 'utf8');
    const result = await scanDeadCode();
    expect(result.findings.filter((f) => f.message.includes('console.log'))).toHaveLength(0);
  });
});
