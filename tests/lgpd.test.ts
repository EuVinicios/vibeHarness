import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { scanLGPD } from '../src/scanners/lgpd.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-lgpd-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('scanLGPD', () => {
  it('returns a valid score and finding list', async () => {
    const result = await scanLGPD();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(result.maxScore);
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('flags PII (email) in console.log', async () => {
    await writeFile(
      join(tmpDir, 'auth.ts'),
      `console.log('User signed in:', user@example.com, password);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const piiFindings = result.findings.filter((f) => f.category === 'lgpd-pii-logs');
    expect(piiFindings.length).toBeGreaterThan(0);
  });

  it('flags missing deletion endpoint (DSR right to erasure)', async () => {
    await writeFile(
      join(tmpDir, 'routes.ts'),
      `app.get('/api/user', handler);\napp.put('/api/user', handler);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const dsrFindings = result.findings.filter(
      (f) => f.category === 'lgpd-dsr' && f.severity === 'high'
    );
    expect(dsrFindings.length).toBeGreaterThan(0);
  });

  it('does NOT flag deletion endpoint when DELETE /api/user exists', async () => {
    await writeFile(
      join(tmpDir, 'routes.ts'),
      `router.delete('/api/user', async (req, res) => { await deleteUser(req.user.id); res.json({ ok: true }); });\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const deletionMissingFindings = result.findings.filter(
      (f) => f.category === 'lgpd-dsr' && f.message.includes('deletion') && f.severity === 'high'
    );
    expect(deletionMissingFindings.length).toBe(0);
  });

  it('flags weak MD5 hashing', async () => {
    await writeFile(
      join(tmpDir, 'crypto.ts'),
      `import crypto from 'crypto';\nconst hash = crypto.createHash('md5').update(password).digest('hex');\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const hashFindings = result.findings.filter((f) => f.category === 'lgpd-password-hashing');
    expect(hashFindings.length).toBeGreaterThan(0);
  });

  it('does not flag bcrypt hashing', async () => {
    await writeFile(
      join(tmpDir, 'auth.ts'),
      `import bcrypt from 'bcrypt';\nconst hashed = await bcrypt.hash(password, 12);\nawait db.user.create({ data: { password: hashed } });\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const hashFindings = result.findings.filter(
      (f) => f.category === 'lgpd-password-hashing' && f.severity === 'critical'
    );
    expect(hashFindings.length).toBe(0);
  });

  it('skips web-only checks (pages/DSR) when no web surface exists', async () => {
    // Pure CLI/library project — no UI components, no HTTP routes.
    await writeFile(join(tmpDir, 'tool.ts'), `export function run() { return 1; }\n`, 'utf8');
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-pages')).toBe(false);
    expect(result.findings.some((f) => f.category === 'lgpd-dsr')).toBe(false);
    expect(result.findings.some((f) => f.category === 'lgpd-scope')).toBe(true);
  });

  it('info findings (e.g. lgpd-scope) do NOT deduct points', async () => {
    // CLI project: the only finding is the advisory lgpd-scope INFO — full score.
    await writeFile(join(tmpDir, 'tool.ts'), `export function run() { return 1; }\n`, 'utf8');
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-scope')).toBe(true);
    expect(result.findings.every((f) => f.severity === 'info')).toBe(true);
    expect(result.score).toBe(result.maxScore);
  });

  it('runs DSR checks when an HTTP API surface exists', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.post('/api/orders', handler);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-dsr')).toBe(true);
    expect(result.findings.some((f) => f.category === 'lgpd-scope')).toBe(false);
  });
});
