import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
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

/** DSR obligations only exist when user data is persisted (v0.8.3 gate) —
 * give the DSR fixtures a persistence layer so they exercise the checks. */
async function addPersistence(): Promise<void> {
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '0.0.0', dependencies: { pg: '^8.11.0' } }),
    'utf8'
  );
}

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
    await addPersistence();
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
    await addPersistence();
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
    await addPersistence();
    await writeFile(
      join(tmpDir, 'server.ts'),
      `const app = express();\napp.post('/api/orders', handler);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-dsr' && f.severity !== 'info')).toBe(true);
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

describe('scanLGPD — scanner accuracy regressions (v0.8.2)', () => {
  it('does NOT flag Unix timestamps or numeric IDs as phone numbers', async () => {
    await writeFile(
      join(tmpDir, 'app.ts'),
      `console.log("started at 1723800000");\nconsole.log("order 1234567890");\nconsole.log("id 99999999999");\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.message.includes('Phone'))).toBe(false);
    expect(result.findings.some((f) => f.message.includes('CPF'))).toBe(false);
  });

  it('still flags real BR phone formats (+55, separators, parentheses)', async () => {
    await writeFile(
      join(tmpDir, 'app.ts'),
      `console.log("tel +5511912345678");\nconsole.log("tel (11) 91234-5678");\nconsole.log("tel 11 91234-5678");\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const phones = result.findings.filter((f) => f.message.includes('Phone'));
    expect(phones.length).toBeGreaterThan(0);
  });

  it('flags bare 11-digit numbers ONLY when the CPF checksum is valid', async () => {
    await writeFile(join(tmpDir, 'ok.ts'), `console.log("cpf 11144477735");\n`, 'utf8');
    const flagged = await scanLGPD();
    expect(flagged.findings.some((f) => f.message.includes('CPF'))).toBe(true);

    await writeFile(join(tmpDir, 'ok.ts'), `console.log("cpf 12345678901");\n`, 'utf8');
    const clean = await scanLGPD();
    expect(clean.findings.some((f) => f.message.includes('CPF'))).toBe(false);
  });

  it('does NOT flag INSERT when hashing is applied on the same statement', async () => {
    await writeFile(
      join(tmpDir, 'db.ts'),
      `await db.query("INSERT INTO users (email, password) VALUES (?, ?)", [email, bcrypt.hash(pwd, 12)]);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(
      result.findings.some((f) => f.message.includes('plaintext password inserted'))
    ).toBe(false);
  });

  it('flags INSERT of an unhashed password ($ and ? placeholders alike)', async () => {
    await writeFile(
      join(tmpDir, 'db.ts'),
      `await db.query("INSERT INTO users (email, password) VALUES ($1, $2)", [email, pwd]);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(
      result.findings.some(
        (f) => f.message.includes('plaintext password inserted') && f.severity === 'critical'
      )
    ).toBe(true);
  });

  it('flags Python f-string interpolation of sensitive words (dynamic)', async () => {
    await writeFile(join(tmpDir, 'app.py'), `print(f"senha do usuario: {senha}")\n`, 'utf8');
    const result = await scanLGPD();
    expect(
      result.findings.some((f) => f.category === 'lgpd-pii-logs' && f.severity === 'high')
    ).toBe(true);
  });

  it('does NOT flag static Python print messages', async () => {
    await writeFile(join(tmpDir, 'app.py'), `print("senha invalida")\n`, 'utf8');
    const result = await scanLGPD();
    const high = result.findings.filter((f) => f.category === 'lgpd-pii-logs' && f.severity === 'high');
    expect(high).toHaveLength(0);
  });

  it('does NOT flag commented-out logging code', async () => {
    await writeFile(join(tmpDir, 'old.ts'), `// console.log(password);\n// console.log("email a@b.co");\n`, 'utf8');
    const result = await scanLGPD();
    const high = result.findings.filter((f) => f.category === 'lgpd-pii-logs' && f.severity === 'high');
    expect(high).toHaveLength(0);
  });

  it('recognises axios.delete / fastify.delete as DSR deletion evidence', async () => {
    await addPersistence();
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(join(tmpDir, 'settings.ts'), `export const del = () => axios.delete('/api/user');\n`, 'utf8');
    const result = await scanLGPD();
    const deletionMissing = result.findings.filter(
      (f) => f.category === 'lgpd-dsr' && f.message.includes('deletion')
    );
    expect(deletionMissing).toHaveLength(0);
  });

  it('recognises fetch with DELETE method as DSR deletion evidence', async () => {
    await addPersistence();
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(
      join(tmpDir, 'settings.ts'),
      `export const del = () => fetch('/api/user', { method: 'DELETE' });\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const deletionMissing = result.findings.filter(
      (f) => f.category === 'lgpd-dsr' && f.message.includes('deletion')
    );
    expect(deletionMissing).toHaveLength(0);
  });

  it('recognises Next.js App Router DELETE handler in an account route file', async () => {
    await addPersistence();
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await mkdir(join(tmpDir, 'app', 'account'), { recursive: true });
    await writeFile(
      join(tmpDir, join('app', 'account', 'route.ts')),
      `export async function DELETE(req: Request) { return new Response('ok'); }\n`,
      'utf8'
    );
    const result = await scanLGPD();
    const deletionMissing = result.findings.filter(
      (f) => f.category === 'lgpd-dsr' && f.message.includes('deletion')
    );
    expect(deletionMissing).toHaveLength(0);
  });

  it('recognises GET /api/user/export (path-first) as DSR export evidence', async () => {
    await addPersistence();
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(
      join(tmpDir, 'routes.ts'),
      `app.delete('/api/user', del);\napp.get('/api/user/export', exp);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.filter((f) => f.category === 'lgpd-dsr')).toHaveLength(0);
  });

  it('does NOT accept gtag (analytics) as cookie consent', async () => {
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(join(tmpDir, 'analytics.tsx'), `export const G = () => <script src="gtag.js" />;\n`, 'utf8');
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-consent')).toBe(true);
  });

  it('does NOT accept a commented-out route as a privacy page', async () => {
    await writeFile(join(tmpDir, 'server.ts'), `app.get('/api/orders', handler);\n// TODO: criar pagina /privacy depois\n`, 'utf8');
    const result = await scanLGPD();
    expect(
      result.findings.some((f) => f.category === 'lgpd-pages' && f.message.includes('Privacy'))
    ).toBe(true);
  });

  it('reports weak MD5/SHA1 as HIGH with verification guidance (not blind critical)', async () => {
    await writeFile(join(tmpDir, 'gravatar.ts'), `const avatar = md5(email);\n`, 'utf8');
    const result = await scanLGPD();
    const md5 = result.findings.find((f) => f.message.includes('MD5 hash detected'));
    expect(md5).toBeDefined();
    expect(md5?.severity).toBe('high');
  });
});

describe('scanLGPD — DSR beyond HTTP (v0.8)', () => {
  it('recognises Supabase RPC delete/export as DSR evidence', async () => {
    await addPersistence();
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
    await addPersistence();
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

describe('scanLGPD — v0.8.3 regressions', () => {
  it('detects MULTI-LINE INSERT…password statements (template literals)', async () => {
    await writeFile(
      join(tmpDir, 'db.ts'),
      'const q = `INSERT INTO users (email, password)\nVALUES ($1, $2)`;\nawait db.query(q, [email, pwd]);\n',
      'utf8'
    );
    const result = await scanLGPD();
    expect(
      result.findings.some(
        (f) => f.message.includes('plaintext password inserted') && f.severity === 'critical'
      )
    ).toBe(true);
  });

  it('does NOT flag multi-line INSERT hashed on the preceding line', async () => {
    await writeFile(
      join(tmpDir, 'db.ts'),
      'const hash = await bcrypt.hash(pwd, 12);\nconst q = `INSERT INTO users (email, password)\nVALUES ($1, $2)`;\nawait db.query(q, [email, hash]);\n',
      'utf8'
    );
    const result = await scanLGPD();
    expect(
      result.findings.some((f) => f.message.includes('plaintext password inserted'))
    ).toBe(false);
  });

  it('formatted CPF only flags with a valid checksum (lot numbers stay quiet)', async () => {
    await writeFile(join(tmpDir, 'log1.ts'), 'console.log("cpf 111.444.777-35");\n', 'utf8');
    const flagged = await scanLGPD();
    expect(flagged.findings.some((f) => f.message.includes('CPF'))).toBe(true);

    await writeFile(join(tmpDir, 'log1.ts'), 'console.log("lote 100 200 300 05");\n', 'utf8');
    const clean = await scanLGPD();
    expect(clean.findings.some((f) => f.message.includes('CPF'))).toBe(false);
  });

  it('PII after a helper call is no longer blinded by the first ")"', async () => {
    await writeFile(join(tmpDir, 'log2.ts'), "console.log(getUser(), 'cliente a@b.co');\n", 'utf8');
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-pii-logs')).toBe(true);
  });

  it('prose mentioning LGPD does not satisfy consent; a banner mention does', async () => {
    await writeFile(join(tmpDir, 'page.tsx'), 'export const P = () => <p>Estamos em conformidade com a LGPD</p>;\n', 'utf8');
    const prose = await scanLGPD();
    expect(prose.findings.some((f) => f.category === 'lgpd-consent')).toBe(true);

    await writeFile(join(tmpDir, 'page.tsx'), 'export const B = () => <div>banner LGPD: aceitar cookies</div>;\n', 'utf8');
    const banner = await scanLGPD();
    expect(banner.findings.some((f) => f.category === 'lgpd-consent')).toBe(false);
  });

  it('web app without persistence: DSR checks downgrade to a scope info', async () => {
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(join(tmpDir, 'routes.ts'), `app.get('/api/orders', handler);\n`, 'utf8');
    const result = await scanLGPD();
    const dsr = result.findings.filter((f) => f.category === 'lgpd-dsr');
    expect(dsr.every((f) => f.severity === 'info')).toBe(true);
  });

  it('recognises App Router dynamic-segment routes and const DELETE handlers', async () => {
    await addPersistence();
    await writeFile(join(tmpDir, 'page.tsx'), 'export default function Page() { return <div/>; }\n', 'utf8');
    await writeFile(
      join(tmpDir, 'routes.ts'),
      `app.get('/api/user/export', exp);\n`,
      'utf8'
    );
    await mkdir(join(tmpDir, 'app', 'api', 'user', '[id]'), { recursive: true });
    await writeFile(
      join(tmpDir, join('app', 'api', 'user', '[id]', 'route.ts')),
      `export const DELETE = async (req: Request) => new Response('ok');\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.filter((f) => f.category === 'lgpd-dsr')).toHaveLength(0);
  });

  it('block/HTML comments no longer satisfy or hide heuristics', async () => {
    // JSDoc example must not flag PII…
    await writeFile(join(tmpDir, 'doc.ts'), '/** Example: console.log("contact a@b.co") */\nexport const x = 1;\n', 'utf8');
    const commented = await scanLGPD();
    expect(commented.findings.some((f) => f.category === 'lgpd-pii-logs')).toBe(false);
  });

  it('a commented-out CREATE POLICY no longer fakes RLS evidence', async () => {
    await mkdir(join(tmpDir, 'prisma'), { recursive: true });
    await writeFile(join(tmpDir, 'prisma', 'schema.prisma'), 'datasource db { provider = "postgresql" }\n', 'utf8');
    await writeFile(join(tmpDir, 'mig.sql'), '-- CREATE POLICY users_select ON users FOR SELECT USING (true);\n', 'utf8');
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-rls')).toBe(true);
  });
});

describe('scanLGPD — v0.8.4 regressions (self-harness dogfooding)', () => {
  it('generated docs output (mkdocs site/) is not a web surface — no consent/banner findings', async () => {
    // Dogfooding finding: this repo's own `site/index.html` (mkdocs build
    // artefact) read as a web app, producing a cookie-consent WARN on a CLI
    // that has no UI at all. getSourceFiles globs with dot:true, so the
    // exclusion must come from EXCLUDED_DIRS, not glob defaults.
    await writeFile(join(tmpDir, 'cli.ts'), `export function run() { return 1; }\n`, 'utf8');
    await mkdir(join(tmpDir, 'site'), { recursive: true });
    await writeFile(
      join(tmpDir, 'site', 'index.html'),
      '<html><body><nav><a href="/">Docs</a></nav></body></html>\n',
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-consent')).toBe(false);
    expect(result.findings.some((f) => f.category === 'lgpd-pages')).toBe(false);
    expect(result.findings.some((f) => f.category === 'lgpd-scope' && f.severity === 'info')).toBe(true);
  });

  it('routes mentioned in comments, strings, regexes and test files are not a web surface', async () => {
    // The harness's own scanner source tripped web-surface detection with
    // fix-text examples (`'Add app.get("/healthz", …)'`), heuristic regexes
    // and test fixtures — scoring the CLI as a web app.
    await writeFile(
      join(tmpDir, 'scanner.ts'),
      [
        '// docs: app.get(\'/api/users\', handler)',
        'export const RE = /@Delete|app\\.(get|post)/;',
        'export const fix = \'Add `app.get("/healthz", h)` to your server.\';',
        'export function run() { return 1; }',
      ].join('\n'),
      'utf8'
    );
    await mkdir(join(tmpDir, 'tests'), { recursive: true });
    await writeFile(join(tmpDir, 'tests', 'fixture.ts'), `app.get('/health', handler);\n`, 'utf8');
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-scope' && f.severity === 'info')).toBe(true);
    expect(result.findings.some((f) => f.category === 'lgpd-consent')).toBe(false);
  });

  it('real server code still counts as a web surface', async () => {
    await writeFile(
      join(tmpDir, 'server.ts'),
      `import express from 'express';\nconst app = express();\napp.get('/users', handler);\n`,
      'utf8'
    );
    const result = await scanLGPD();
    expect(result.findings.some((f) => f.category === 'lgpd-scope')).toBe(false);
  });
});
