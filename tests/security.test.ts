import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanSecrets } from '../src/scanners/security.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-sec-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('scanSecrets — secret patterns', () => {
  it('reports multiple distinct secret types in the same file (no first-match break)', async () => {
    // Built at runtime so the literals never appear in this source file.
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP'; // 16 chars after prefix
    const ghToken = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz0123456789'; // 36 chars
    await writeFile(
      join(tmpDir, 'leaky.ts'),
      `const a = "${awsKey}";\nconst b = "${ghToken}";\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const leaky = result.findings.filter((f) => f.file === 'leaky.ts');
    const labels = leaky.map((f) => f.message);
    expect(labels.some((m) => m.includes('AWS'))).toBe(true);
    expect(labels.some((m) => m.includes('GitHub'))).toBe(true);
  });

  it('detects Google API keys', async () => {
    const googleKey = 'AIza' + 'A'.repeat(35);
    await writeFile(join(tmpDir, 'maps.ts'), `const key = "${googleKey}";\n`, 'utf8');
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.message.includes('Google API key'))).toBe(true);
  });

  it('does not scan local .env files (legitimate secret storage)', async () => {
    await writeFile(join(tmpDir, '.env'), 'PASSWORD=supersecretvalue123\n', 'utf8');
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.file === '.env')).toBe(false);
  });

  it('honors .vibe/auditignore exclusions', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), '# fixtures\nleaky.ts\n', 'utf8');
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 'leaky.ts'), `const a = "${awsKey}";\n`, 'utf8'); // ignored
    await writeFile(join(tmpDir, 'victim.ts'), `const b = "${awsKey}";\n`, 'utf8'); // flagged
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.file === 'leaky.ts')).toBe(false);
    expect(result.findings.some((f) => f.file === 'victim.ts')).toBe(true);
  });
});

describe('scanSecrets — insecure coding patterns', () => {
  it('flags wildcard CORS with credentials as critical', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `import express from 'express';\nimport cors from 'cors';\nconst app = express();\napp.use(cors({ origin: '*', credentials: true }));\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const cors = result.findings.find((f) => f.message.includes('Wildcard CORS'));
    expect(cors).toBeDefined();
    expect(cors?.severity).toBe('critical');
  });

  it('flags jwt.decode without jwt.verify', async () => {
    await writeFile(
      join(tmpDir, 'auth.ts'),
      `import jwt from 'jsonwebtoken';\nconst claims = jwt.decode(token);\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const finding = result.findings.find((f) => f.message.includes('jwt.decode'));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('high');
  });

  it('flags hardcoded JWT secrets', async () => {
    await writeFile(
      join(tmpDir, 'jwt-sign.ts'),
      `import jwt from 'jsonwebtoken';\nconst t = jwt.sign(payload, 'my-super-secret-jwt-key');\nconst v = jwt.verify(t, 'my-super-secret-jwt-key');\n`,
      'utf8'
    );
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.message.includes('JWT secret hardcoded'))).toBe(true);
  });

  it('does not flag clean express apps on trivial greetings', async () => {
    await writeFile(join(tmpDir, 'clean.ts'), `export const greeting = "hello world";\n`, 'utf8');
    const result = await scanSecrets();
    expect(result.findings.filter((f) => f.file === 'clean.ts')).toHaveLength(0);
  });
});
