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

  it('auditignore suppresses non-critical findings, but criticals survive in non-test files (v0.9)', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), '# fixtures\nleaky.ts\n', 'utf8');
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 'leaky.ts'), `const a = "${awsKey}";\n`, 'utf8'); // critical → NOT suppressed
    await writeFile(join(tmpDir, 'victim.ts'), `const b = "${awsKey}";\n`, 'utf8'); // flagged
    const result = await scanSecrets();
    // Vendor criticals can no longer be hidden by auditignore in non-test files.
    expect(result.findings.some((f) => f.file === 'leaky.ts')).toBe(true);
    expect(result.findings.some((f) => f.file === 'victim.ts')).toBe(true);
    // Suppression accounting is surfaced in the report.
    const summary = result.findings.find((x) => x.category === 'auditignore' && x.severity === 'info');
    expect(summary).toBeTruthy();
  });
});

describe('scanSecrets — extended vendor coverage (v0.8.1)', () => {
  it('detects AWS STS temporary keys (ASIA prefix)', async () => {
    const stsKey = 'ASIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 'sts.ts'), `const k = "${stsKey}";\n`, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'sts.ts');
    expect(f?.message).toContain('AWS STS');
    expect(f?.severity).toBe('critical');
  });

  it('detects Hugging Face tokens', async () => {
    const hfToken = 'hf_' + 'A'.repeat(30);
    await writeFile(join(tmpDir, 'hf.ts'), `const t = "${hfToken}";\n`, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'hf.ts');
    expect(f?.message).toContain('Hugging Face');
    expect(f?.severity).toBe('critical');
  });

  it('detects Google Cloud service account private keys', async () => {
    const sa = JSON.stringify({
      type: 'service_account',
      project_id: 'x',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    await writeFile(join(tmpDir, 'sa.json'), sa, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'sa.json');
    expect(f?.message).toContain('Google Cloud service account');
    expect(f?.severity).toBe('critical');
  });

  it('triages mysql URIs with credentials like other database URIs', async () => {
    await writeFile(
      join(tmpDir, 'db.ts'),
      `const db = "mysql://app_user:Sup3rS3cret@db.internal.example.com:3306/app";\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'db.ts');
    expect(f?.message).toContain('MySQL URI');
    expect(f?.triage).toBe('real');
    expect(f?.severity).toBe('critical');
  });
});

describe('scanSecrets — .gitignore check is line-based', () => {
  it('accepts a real .env entry', async () => {
    await writeFile(join(tmpDir, '.gitignore'), 'node_modules\n.env\n', 'utf8');
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.message.includes('.env files are not excluded'))).toBe(false);
  });

  it('accepts glob forms (.env.*, **/.env)', async () => {
    await writeFile(join(tmpDir, '.gitignore'), '.env.*\n**/.env\n', 'utf8');
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.message.includes('.env files are not excluded'))).toBe(false);
  });

  it('does not accept a comment that merely mentions .env', async () => {
    await writeFile(join(tmpDir, '.gitignore'), '# remember to ignore .env someday\nnode_modules\n', 'utf8');
    const result = await scanSecrets();
    expect(result.findings.some((f) => f.message.includes('.env files are not excluded'))).toBe(true);
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

describe('scanSecrets — triage (v0.8)', () => {
  it('downgrades env-variable references to info/env-reference', async () => {
    await writeFile(
      join(tmpDir, 'script.sh'),
      'API_KEY="$VITE_SUPABASE_ANON_KEY"\n',
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'script.sh');
    expect(f?.triage).toBe('env-reference');
    expect(f?.severity).toBe('info');
  });

  it('downgrades obvious placeholders to low/fixture', async () => {
    await writeFile(
      join(tmpDir, 'conf.ts'),
      `export const cfg = { secret: 'server-secret' };\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'conf.ts');
    expect(f?.triage).toBe('fixture');
    expect(f?.severity).toBe('low');
  });

  it('downgrades localhost CI database URIs to low/ci-ephemeral', async () => {
    await writeFile(
      join(tmpDir, 'ci.yml'),
      'TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres\n',
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'ci.yml');
    expect(f?.triage).toBe('ci-ephemeral');
    expect(f?.severity).toBe('low');
  });

  it('keeps realistic-looking hardcoded secrets as critical/real', async () => {
    await writeFile(
      join(tmpDir, 'bad.ts'),
      `const db = "postgresql://prod_user:S3nh4Real@db.prod.example.com:5432/app";\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'bad.ts');
    expect(f?.triage).toBe('real');
    expect(f?.severity).toBe('critical');
  });

  it('caps generic secrets in test files at medium/fixture', async () => {
    // Built at runtime so the literal never appears in this source file
    // (gitleaks scans the repo source, not the generated fixture).
    const secretVal = 'Kx9Q' + 'm2Vw8Zr4Tn6B';
    await writeFile(
      join(tmpDir, 'app.test.ts'),
      `const opts = { secret: '${secretVal}' };\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'app.test.ts');
    expect(f?.severity).toBe('medium');
    expect(f?.triage).toBe('fixture');
  });

  it('vendor keys stay critical even in test files', async () => {
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 't.test.ts'), `const k = "${awsKey}";\n`, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 't.test.ts');
    expect(f?.severity).toBe('critical');
    expect(f?.triage).toBe('real');
  });

  it('info/low findings deduct less than critical', async () => {
    await writeFile(join(tmpDir, 'a.sh'), 'API_KEY="$SOME_VAR"\n', 'utf8');
    const result = await scanSecrets();
    // only an info finding (0 deduction) + possibly gitignore high
    const secFindings = result.findings.filter((f) => f.category === 'secrets' && f.file === 'a.sh');
    expect(secFindings.every((f) => f.severity === 'info')).toBe(true);
  });
});

describe('scanSecrets — auditignore suppression model (v0.9)', () => {
  it('vendor secrets in ignored NON-test files survive the ignore list', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'config/prod.ts  # known\n', 'utf8');
    await mkdir(join(tmpDir, 'config'), { recursive: true });
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 'config', 'prod.ts'), `const k = "${awsKey}";\n`, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'config/prod.ts');
    expect(f?.severity).toBe('critical');
    expect(f?.triage).toBe('real');
  });

  it('vendor fixtures in ignored TEST files stay suppressed (documented workflow)', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'tests/keys.test.ts  # fixtures\n', 'utf8');
    await mkdir(join(tmpDir, 'tests'), { recursive: true });
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 'tests', 'keys.test.ts'), `const k = "${awsKey}";\n`, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'tests/keys.test.ts');
    expect(f).toBeUndefined();
    const summary = result.findings.find((x) => x.category === 'auditignore' && x.severity === 'info');
    expect(summary?.message).toContain('suppressed');
  });

  it('non-vendor NON-critical findings in ignored files are suppressed but counted', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'src/legacy.ts\n', 'utf8');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    // medium-severity heuristic (cookie without httpOnly) — suppressible
    await writeFile(join(tmpDir, 'src', 'legacy.ts'), "res.cookie('sid', 'abc');\n", 'utf8');
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'src/legacy.ts' && x.category === 'secrets')).toBeUndefined();
    const summary = result.findings.find((x) => x.category === 'auditignore' && x.severity === 'info');
    // Both the cookie-flags and the session/CSRF heuristics fire (2 medium).
    expect(summary?.message).toContain('2 finding(s) suppressed');
    expect(summary?.message).toContain('1 entry(ies) missing an inline reason');
  });

  it('generic REAL credentials in ignored files survive suppression (criticals cannot be hidden)', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'src/legacy.ts\n', 'utf8');
    await mkdir(join(tmpDir, 'src'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'legacy.ts'), 'const password = "MyP4ss!2026x";\n', 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'src/legacy.ts');
    expect(f?.severity).toBe('critical');
    expect(f?.triage).toBe('real');
  });

  it('overly broad patterns are flagged high instead of honoured silently', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), '**/*.ts  # everything\n', 'utf8');
    await writeFile(join(tmpDir, 'index.ts'), 'const password = "MyP4ss!2026x";\n', 'utf8');
    const result = await scanSecrets();
    const broad = result.findings.find((x) => x.category === 'auditignore' && x.severity === 'high');
    expect(broad?.message).toContain('overly broad');
    // The kill-switch must not hide incidents: the critical secret is still reported.
    expect(result.findings.find((x) => x.file === 'index.ts' && x.severity === 'critical')).toBeTruthy();
  });

  it('no auditignore hygiene findings when the file is absent', async () => {
    await writeFile(join(tmpDir, 'index.ts'), 'const ok = 1;\n', 'utf8');
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.category === 'auditignore')).toBeUndefined();
  });
});

describe('scanTaintLite — OWASP sinks a regex can see (v0.9)', () => {
  it('flags $queryRawUnsafe fed by request input as critical', async () => {
    await writeFile(
      join(tmpDir, 'repo.ts'),
      'const rows = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE name = \'${req.query.name}\'`);\n',
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'repo.ts' && x.category === 'injection');
    expect(f?.severity).toBe('critical');
    expect(f?.message).toContain('SQL injection');
  });

  it('flags drizzle sql.raw with request input', async () => {
    await writeFile(
      join(tmpDir, 'repo.ts'),
      "const q = sql.raw('SELECT * FROM posts WHERE title = ' + req.body.title);\n",
      'utf8'
    );
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'repo.ts' && x.message.includes('sql.raw'))).toBeTruthy();
  });

  it('does not flag raw SQL with only internal constants', async () => {
    await writeFile(
      join(tmpDir, 'repo.ts'),
      "const TABLE = 'users';\nconst rows = await prisma.$queryRawUnsafe(`SELECT * FROM ${TABLE}`);\n",
      'utf8'
    );
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'repo.ts' && x.category === 'injection')).toBeUndefined();
  });

  it('flags fetch of a user-controlled URL (SSRF) and respects allowlist markers', async () => {
    await writeFile(join(tmpDir, 'ssrf.ts'), 'const r = await fetch(req.body.webhookUrl);\n', 'utf8');
    const guarded = join(tmpDir, 'ssrf-ok.ts');
    await writeFile(
      guarded,
      'assertAllowedHost(req.body.webhookUrl);\nconst r = await fetch(req.body.webhookUrl);\n',
      'utf8'
    );
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'ssrf.ts' && x.message.includes('SSRF'))).toBeTruthy();
    expect(result.findings.find((x) => x.file === 'ssrf-ok.ts' && x.message.includes('SSRF'))).toBeUndefined();
  });

  it('flags findById on req.params without ownership nearby (BOLA)', async () => {
    await writeFile(
      join(tmpDir, 'bola.ts'),
      'const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });\n',
      'utf8'
    );
    const safe = join(tmpDir, 'bola-ok.ts');
    await writeFile(
      safe,
      'const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id, userId: req.user.id } });\n',
      'utf8'
    );
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'bola.ts' && x.message.includes('BOLA'))).toBeTruthy();
    expect(result.findings.find((x) => x.file === 'bola-ok.ts' && x.message.includes('BOLA'))).toBeUndefined();
  });

  it('flags console.log(req.body) and logger.info({ user }) as privacy findings', async () => {
    await writeFile(
      join(tmpDir, 'log.ts'),
      "console.log('incoming', req.body);\nlogger.info({ user });\n",
      'utf8'
    );
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'log.ts' && x.category === 'privacy');
    expect(f?.severity).toBe('high');
  });

  it('does not flag logging of scalar fields', async () => {
    await writeFile(join(tmpDir, 'log-ok.ts'), "console.log('user id', req.user.id);\n", 'utf8');
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'log-ok.ts' && x.category === 'privacy')).toBeUndefined();
  });

  it('skips taint checks in test files (scanner fixtures)', async () => {
    await writeFile(join(tmpDir, 'fixture.test.ts'), 'const r = await fetch(req.body.url);\n', 'utf8');
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'fixture.test.ts' && x.category === 'injection')).toBeUndefined();
  });
});

describe('scanSecrets — lexical coverage expansion (v0.9)', () => {
  it('treats mixed-class realistic passwords as REAL (isFakeValue narrowing)', async () => {
    await writeFile(join(tmpDir, 'prod.ts'), 'const password = "Admin@Prod2026";\n', 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'prod.ts' && x.category === 'secrets');
    expect(f?.severity).toBe('critical');
    expect(f?.triage).toBe('real');
  });

  it('still downgrades obvious placeholder words', async () => {
    await writeFile(join(tmpDir, 'dev.ts'), 'const password = "my-test-secret";\n', 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'dev.ts' && x.category === 'secrets');
    expect(f?.severity).toBe('low');
    expect(f?.triage).toBe('fixture');
  });

  it('detects backtick literals (GENERIC_VALUE_PATTERNS v0.9)', async () => {
    await writeFile(join(tmpDir, 'bt.ts'), 'const password = `MyRealPass!2026x`;\n', 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'bt.ts' && x.category === 'secrets');
    expect(f?.severity).toBe('critical');
  });

  it('flags mixed template literals as medium (dynamic assembly)', async () => {
    await writeFile(join(tmpDir, 'tpl.ts'), 'const password = `pass-${role}-word`;\n', 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'tpl.ts');
    expect(f?.severity).toBe('medium');
    expect(f?.message).toContain('template literal');
  });

  it('flags unprefixed high-entropy secrets but not digests', async () => {
    // Built at runtime so the high-entropy literal never appears in source (gitleaks)
    const blob = 'Zq8fJ9xK' + 'w2mNpQ7vRt4uLs3hYb6cD5aE';
    await writeFile(
      join(tmpDir, 'ent.ts'),
      `const token = "${blob}";\nconst digest = "${blob}";\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const token = result.findings.find((x) => x.file === 'ent.ts' && x.message.includes('"token"'));
    expect(token?.severity).toBe('high');
    expect(result.findings.find((x) => x.file === 'ent.ts' && x.message.includes('digest'))).toBeUndefined();
  });

  it('new vendor families: GitHub fine-grained, Telegram, Resend', async () => {
    const gh = 'github_pat_' + 'A'.repeat(22) + '_' + 'B'.repeat(59);
    const tg = '1234567890:AA' + 'Hx9kQpLmN4vRtYuIwZsXcDvGbF5aSeRt4uL'.slice(0, 33);
    const rs = 're_' + 'C'.repeat(36);
    await writeFile(
      join(tmpDir, 'vendors.ts'),
      `const a = "${gh}";\nconst b = "${tg}";\nconst c = "${rs}";\n`,
      'utf8'
    );
    const result = await scanSecrets();
    const msgs = result.findings.filter((x) => x.file === 'vendors.ts').map((x) => x.message).join(' | ');
    expect(msgs).toContain('GitHub fine-grained');
    expect(msgs).toContain('Telegram');
    expect(msgs).toContain('Resend');
  });

  it('sk_test_ keys are medium, not critical', async () => {
    const k = 'sk' + '_test_' + 'abcdefghijklmnopqrstuvwxyz';
    await writeFile(join(tmpDir, 'stripe.ts'), `const key = "${k}";\n`, 'utf8');
    const result = await scanSecrets();
    const f = result.findings.find((x) => x.file === 'stripe.ts');
    expect(f?.severity).toBe('medium');
  });

  it('scans Go/Ruby/PHP/Java/C# files for secrets', async () => {
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    await writeFile(join(tmpDir, 'main.go'), `key := "${awsKey}"\n`, 'utf8');
    await writeFile(join(tmpDir, 'app.rb'), `key = "${awsKey}"\n`, 'utf8');
    const result = await scanSecrets();
    expect(result.findings.find((x) => x.file === 'main.go')).toBeTruthy();
    expect(result.findings.find((x) => x.file === 'app.rb')).toBeTruthy();
  });
});
