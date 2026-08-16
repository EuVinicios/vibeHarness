import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanInfra } from '../src/scanners/infra.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-infra-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('scanInfra — web-surface gating', () => {
  it('returns full score and a single scope info finding for pure CLI projects', async () => {
    await writeFile(join(tmpDir, 'cli.ts'), `export function run() { return 1; }\n`, 'utf8');
    const result = await scanInfra();
    expect(result.score).toBe(result.maxScore);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('info');
    expect(result.findings[0].category).toBe('infra-scope');
  });

  it('runs web checks when an HTTP API surface exists', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('/health', handler);\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(result.findings.some((f) => f.category === 'infra-scope')).toBe(false);
  });
});

describe('scanInfra — health endpoint detection', () => {
  it.each([
    '/health',
    '/healthz',
    '/healthcheck',
    '/api/health',
    '/health/live',
    '/health/ready',
  ])('recognises %s as a health endpoint', async (route) => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('${route}', (req, res) => res.json({ status: 'ok' }));\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(
      result.findings.some((f) => f.category === 'infra' && f.message.includes('/health'))
    ).toBe(false);
  });

  it('flags a missing health endpoint on a web project', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('/api/orders', handler);\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(
      result.findings.some((f) => f.category === 'infra' && f.message.includes('/health'))
    ).toBe(true);
  });
});

describe('scanInfra — comments never satisfy heuristics', () => {
  it('does NOT treat a TODO comment as rate limiting', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('/health', handler);\n// TODO: add rate limiting\napp.use(errorHandler);\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(result.findings.some((f) => f.message.includes('rate-limiting'))).toBe(true);
  });

  it('does NOT treat a commented-out health route as an endpoint', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\n// app.get('/health', handler);\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(
      result.findings.some((f) => f.category === 'infra' && f.message.includes('/health'))
    ).toBe(true);
  });

  it('still recognises real rate-limiting middleware', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('/health', handler);\napp.use(rateLimit({ max: 100 }));\napp.use(errorHandler);\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(result.findings.some((f) => f.message.includes('rate-limiting'))).toBe(false);
  });
});

describe('scanInfra — error handler detection', () => {
  it('does NOT count onError in a non-backend file as an error handler', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('/health', handler);\napp.use(rateLimit({ max: 100 }));\n`,
      'utf8'
    );
    await writeFile(
      join(tmpDir, 'component.ts'),
      `export const imgProps = { onError: () => {} };\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(result.findings.some((f) => f.message.includes('error handler'))).toBe(true);
  });

  it('counts onError when the same file has a backend marker', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `import express from 'express';\nconst app = express();\napp.get('/health', handler);\napp.use(rateLimit({ max: 100 }));\nconst server = createServer(app);\nserver.onError = (err) => log(err);\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(result.findings.some((f) => f.message.includes('error handler'))).toBe(false);
  });
});

describe('scanInfra — .vibe/auditignore', () => {
  it('ignores files matched by .vibe/auditignore', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'legacy/**\n', 'utf8');
    // Web surface lives in a non-ignored file…
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.get('/health', handler);\n`,
      'utf8'
    );
    // …and the only rate limiter sits inside the ignored directory.
    await mkdir(join(tmpDir, 'legacy'), { recursive: true });
    await writeFile(
      join(tmpDir, 'legacy', 'limiter.ts'),
      `const rateLimit = require('express-rate-limit');\n`,
      'utf8'
    );
    const result = await scanInfra();
    expect(result.findings.some((f) => f.message.includes('rate-limiting'))).toBe(true);
  });
});
