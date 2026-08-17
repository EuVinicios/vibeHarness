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

  it('redacts entire multiline PEM private key blocks', async () => {
    const pemBody = 'MIIabc123DEF456ghi789JKL012MNO345PQR678STU901VWX234YZa567bcd890ef';
    await writeFile(
      join(tmpDir, 'keys.md'),
      `# notes\n-----BEGIN RSA PRIVATE KEY-----\n${pemBody}\n${pemBody}\n-----END RSA PRIVATE KEY-----\ndone\n`,
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).not.toContain(pemBody);
    expect(content).toContain('[REDACTED by vibe-harness]');
  });

  it('redacts unquoted env-style secret assignments', async () => {
    await writeFile(join(tmpDir, 'deploy.sh'), 'DB_PASSWORD=sup3rs3cr3t-value\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).not.toContain('sup3rs3cr3t-value');
    expect(content).toContain('DB_PASSWORD=[REDACTED by vibe-harness]');
  });

  it('redacts YAML-style unquoted secrets', async () => {
    await writeFile(join(tmpDir, 'settings.yaml'), 'database_password: hunter2value123\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).not.toContain('hunter2value123');
  });

  it('does NOT redact pinned git commit SHAs (CI action pins)', async () => {
    await writeFile(
      join(tmpDir, 'workflow-gen.ts'),
      `const CHECKOUT_SHA = '11d5960a326750d5838078e36cf38b85af677262';\n`,
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).toContain('11d5960a326750d5838078e36cf38b85af677262');
    expect(result.redactedCount).toBe(0);
  });

  it('does NOT redact regex alternation lists (secret-prefix patterns)', async () => {
    // Built at runtime so the literal prefixes never appear in this source
    // file (the repo's own pre-commit hook greps for them).
    const prefixes = ['sk' + '_' + 'live' + '_', 'ghp_' + '[A-Za-z0-9]{36}', 'AKIA' + '[0-9A-Z]{16}'];
    await writeFile(
      join(tmpDir, 'hook.sh'),
      `VH_PATTERNS="${prefixes.join('|')}"\n`,
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).toContain(`VH_PATTERNS="${prefixes.join('|')}"`);
    expect(result.redactedCount).toBe(0);
  });

  it('does NOT redact shell command substitutions or the redaction marker itself', async () => {
    await writeFile(
      join(tmpDir, 'hook.sh'),
      `VH_TMP="$(mktemp)"\n`,
      'utf8'
    );
    await writeFile(
      join(tmpDir, 'redactor.ts'),
      `const REDACTED = '[REDACTED by vibe-harness]';\n`,
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).toContain('VH_TMP="$(mktemp)"');
    expect(content).toContain(`const REDACTED = '[REDACTED by vibe-harness]';`);
    expect(result.redactedCount).toBe(0);
  });

  it('still redacts real secrets in the same file as safe values', async () => {
    await writeFile(
      join(tmpDir, 'ci.ts'),
      [
        `const CHECKOUT_SHA = '11d5960a326750d5838078e36cf38b85af677262';`,
        `const STRIPE_SECRET = 'whsec_abcdefghijklmnopqrstuvwxyz012345';`,
      ].join('\n') + '\n',
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).toContain('11d5960a326750d5838078e36cf38b85af677262');
    expect(content).not.toContain('whsec_abcdefghijklmnopqrstuvwxyz012345');
    expect(result.redactedCount).toBeGreaterThan(0);
  });

  it('never includes key material files (.pem/.key) even if reachable', async () => {
    await writeFile(join(tmpDir, 'server.pem'), '-----BEGIN PRIVATE KEY-----\nMIIsecret\n-----END PRIVATE KEY-----\n', 'utf8');
    await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(join(tmpDir, 'CONTEXT.md'), 'utf8');
    expect(content).not.toContain('MIIsecret');
    expect(content).not.toContain('server.pem');
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

  it('redacts EVERY secret on a line — minified bundles (v0.8.3)', async () => {
    // Pre-0.8.3 the curated patterns replaced only the first match per line,
    // so the second token on a minified line leaked into CONTEXT.md.
    const gh = 'gh' + 'p' + '_';
    const tokenA = gh + 'a'.repeat(36);
    const tokenB = gh + 'b'.repeat(36);
    const tokenC = gh + 'c'.repeat(36);
    await writeFile(
      join(tmpDir, 'bundle.js'),
      `var a="${tokenA}";var b="${tokenB}";var c="${tokenC}";\n`,
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).not.toContain(tokenA);
    expect(content).not.toContain(tokenB);
    expect(content).not.toContain(tokenC);
  });

  it('redacts multiple generic assignments on one line', async () => {
    await writeFile(
      join(tmpDir, 'env.sh'),
      'DB_PASSWORD=first-secret-value API_TOKEN=second-secret-value\n',
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const content = await readFile(result.outputPath, 'utf8');
    expect(content).not.toContain('first-secret-value');
  });
});

describe('packager redaction expansion (v0.9)', () => {
  it('redacts camelCase identifiers (const token = "…")', async () => {
    // Built at runtime so the high-entropy literal never appears in source (gitleaks)
    const blob = 'Zq8fJ9' + 'xKw2mNpQ7vRt4uLs3hYb';
    await writeFile(join(tmpDir, 'cfg.ts'), `const token = "${blob}";\n`, 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const ctx = await readFile(result.outputPath, 'utf8');
    expect(ctx).not.toContain('Zq8fJ9');
    expect(ctx).toContain('[REDACTED by vibe-harness]');
  });

  it('redacts capitalized YAML keys (Password:)', async () => {
    await writeFile(join(tmpDir, 'svc.yaml'), 'Password: Sup3rS3cretValue\n', 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const ctx = await readFile(result.outputPath, 'utf8');
    expect(ctx).not.toContain('Sup3rS3cretValue');
  });

  it('redacts GitHub fine-grained tokens (github_pat_)', async () => {
    const pat = 'github_pat_' + 'A'.repeat(22) + '_' + 'B'.repeat(59);
    await writeFile(join(tmpDir, 'gh.ts'), `const t = "${pat}";\n`, 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const ctx = await readFile(result.outputPath, 'utf8');
    expect(ctx).not.toContain(pat);
  });

  it('no longer over-redacts npm version pins (MCP server pins)', async () => {
    await writeFile(
      join(tmpDir, 'pins.ts'),
      "const MCP_SERVER_FILESYSTEM = '@modelcontextprotocol/server-filesystem@2026.7.10';\n",
      'utf8'
    );
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const ctx = await readFile(result.outputPath, 'utf8');
    expect(ctx).toContain('@modelcontextprotocol/server-filesystem@2026.7.10');
  });

  it('never redacts high-entropy values on non-secret identifiers', async () => {
    // Built at runtime so the high-entropy literal never appears in source (gitleaks)
    const blob = 'Zq8fJ9' + 'xKw2mNpQ7vRt4u';
    await writeFile(join(tmpDir, 'ok.ts'), `const displayName = "${blob}";\n`, 'utf8');
    const result = await packContext({ outputPath: join(tmpDir, 'CONTEXT.md') });
    const ctx = await readFile(result.outputPath, 'utf8');
    expect(ctx).toContain(blob);
  });
});
