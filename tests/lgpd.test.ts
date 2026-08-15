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

describe('scanLGPD — PII log triage (v0.8)', () => {
  it('does NOT flag static log messages that merely mention a sensitive word', async () => {
    await writeFile(
      join(tmpDir, 'auth.ts'),
      `console.error('Error resetting password:', err);\nconsole.log('Invalid webhook token received');\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const high = result.findings.filter((f) => f.category === 'lgpd-pii-logs' && f.severity !== 'info');
    expect(high).toHaveLength(0);
    const summary = result.findings.find((f) => f.triage === 'static-message');
    expect(summary).toBeDefined();
  });

  it('flags interpolated sensitive values as high/real', async () => {
    await writeFile(
      join(tmpDir, 'leak.ts'),
      'console.log(`Customer found by CPF: ${customer.cpf}`);\n',
      'utf8'
    );
    const result = await scanLGPD();
    const high = result.findings.filter((f) => f.category === 'lgpd-pii-logs' && f.severity === 'high');
    expect(high.length).toBeGreaterThan(0);
    expect(high.some((f) => f.triage === 'real')).toBe(true);
  });

  it('flags logged bare identifiers (console.log(password))', async () => {
    await writeFile(join(tmpDir, 'bare.ts'), 'console.log(password);\n', 'utf8');
    const result = await scanLGPD();
    expect(
      result.findings.some((f) => f.category === 'lgpd-pii-logs' && f.severity === 'high')
    ).toBe(true);
  });
});

describe('scanLGPD — DSR beyond HTTP (v0.8)', () => {
  it('recognises Supabase RPC delete/export as DSR evidence', async () => {
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(
      join(tmpDir, 'account.ts'),
      `import { supabase } from './lib';\nexport const del = () => supabase.rpc('delete_own_account');\nexport const exp = () => supabase.rpc('export_user_data');\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.filter((f) => f.category === 'lgpd-dsr')).toHaveLength(0);
  });

  it('recognises SQL functions named delete_own_account / export_user_data', async () => {
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(
      join(tmpDir, 'lgpd.sql'),
      'CREATE FUNCTION delete_own_account() RETURNS boolean AS $$ BEGIN RETURN true; END; $$ LANGUAGE plpgsql;\nCREATE FUNCTION export_user_data() RETURNS json AS $$ BEGIN RETURN \'{}\'; END; $$ LANGUAGE plpgsql;\n',
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.filter((f) => f.category === 'lgpd-dsr')).toHaveLength(0);
  });
});
