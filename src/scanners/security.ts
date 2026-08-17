import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnoreEntries, resolveAuditIgnoreFiles, isOverlyBroadPattern } from '../utils/audit-ignore.js';
import { verifyGuardrails } from '../utils/guardrails.js';
import { detectPackageManager } from '../core/stage.js';
import type { Finding, AuditSectionResult } from '../core/types.js';

const execFileAsync = promisify(execFile);

/**
 * Secret & insecure-code scanner.
 *
 * Knowledge base (declared in docs/ferramentas-validadas.md §6): the secret
 * families below follow the public formats documented by GitHub Secret
 * Scanning and the rule families of gitleaks; generic-assignment heuristics
 * are informed by truffleHog/detect-secrets; the insecure-code checks map
 * OWASP Top 10 weaknesses. This is an independent, compact, fully local
 * implementation — no third-party code is copied or executed here. When the
 * gitleaks binary is present it takes over pre-commit/CI scanning.
 */

export const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk_live_[0-9a-zA-Z]{24,}\b/, 'Stripe live secret key'],
  [/\bpk_live_[0-9a-zA-Z]{24,}\b/, 'Stripe live publishable key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS Access Key ID'],
  [/ASIA[0-9A-Z]{16}/, 'AWS STS temporary access key'],
  [/\bhf_[A-Za-z0-9]{30,}\b/, 'Hugging Face API token'],
  [/"private_key"\s*:\s*"-----BEGIN[^"]*PRIVATE KEY/, 'Google Cloud service account private key'],
  [/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}/, 'GitHub fine-grained token'],
  [/\bsk-ant-[0-9a-zA-Z_-]{20,}/, 'Anthropic API key'],
  [/\bsk-proj-[0-9a-zA-Z_-]{20,}/, 'OpenAI project API key'],
  [/\bsk-[0-9a-zA-Z]{40,}\b/, 'OpenAI API key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/xox[abprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/glpat-[0-9A-Za-z_-]{20,}/, 'GitLab personal access token'],
  [/SG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}/, 'SendGrid API key'],
  [/\bre_[A-Za-z0-9]{32,}\b/, 'Resend API key'],
  [/\b[0-9]{8,10}:AA[A-Za-z0-9_-]{33}\b/, 'Telegram bot token'],
  [/\bSK[0-9a-f]{32}\b/, 'Twilio API key'],
  [/-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/, 'Private key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'Hardcoded JWT'],
  [/password\s*=\s*["'][^"']{4,}["']/i, 'Hardcoded password'],
  [/api[_-]?key\s*[:=]\s*["'][^"']{8,}["']/i, 'Hardcoded API key'],
  [/secret\s*[:=]\s*["'][^"']{8,}["']/i, 'Hardcoded secret'],
  [/mongodb(\+srv)?:\/\/[^@\s]+:[^@\s]+@/, 'MongoDB URI with credentials'],
  [/postgresql:\/\/[^@\s]+:[^@\s]+@/, 'PostgreSQL URI with credentials'],
];

/** Test-mode keys: still secrets (rotation-worthy) but not live-money critical. */
export const TEST_KEY_PATTERNS: [RegExp, string][] = [
  [/\bsk_test_[0-9a-zA-Z]{24,}\b/, 'Stripe test secret key'],
  [/\bpk_test_[0-9a-zA-Z]{24,}\b/, 'Stripe test publishable key'],
];

/**
 * Vendor/structural patterns — a match is a real incident regardless of
 * context (test fixture or not). Never downgraded by triage.
 */
const VENDOR_LABELS = new Set([
  'Stripe live secret key',
  'Stripe live publishable key',
  'AWS Access Key ID',
  'AWS STS temporary access key',
  'Hugging Face API token',
  'Google Cloud service account private key',
  'GitHub token',
  'GitHub fine-grained token',
  'Anthropic API key',
  'OpenAI project API key',
  'OpenAI API key',
  'Google API key',
  'Slack token',
  'GitLab personal access token',
  'SendGrid API key',
  'Resend API key',
  'Telegram bot token',
  'Twilio API key',
  'Private key',
  'Hardcoded JWT',
]);

/** Generic assignment patterns with a capture group for the literal value (triage input).
 * v0.9: backtick literals count too — `password = \`real-pass\`` is still a literal. */
const GENERIC_VALUE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Hardcoded password', re: /password\s*=\s*(["'`])([^"'`]{4,})\1/gi },
  { label: 'Hardcoded API key', re: /api[_-]?key\s*[:=]\s*(["'`])([^"'`]{8,})\1/gi },
  { label: 'Hardcoded secret', re: /secret\s*[:=]\s*(["'`])([^"'`]{8,})\1/gi },
];

/** Connection-URI patterns capturing user, password and host (triage input). */
const DB_URI_VALUE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'MongoDB URI with credentials', re: /mongodb(?:\+srv)?:\/\/([^@\s"'`]+):([^@\s"'`]+)@([^\s"'`/]+)/g },
  { label: 'PostgreSQL URI with credentials', re: /postgresql:\/\/([^@\s"'`]+):([^@\s"'`]+)@([^\s"'`/]+)/g },
  { label: 'MySQL URI with credentials', re: /mysql:\/\/([^@\s"'`]+):([^@\s"'`]+)@([^\s"'`/]+)/g },
];

/* ─── Triage heuristics (v0.8 — born from real dogfooding data) ──────────────
 * Findings are NEVER hidden by triage; they are re-classified and downgraded
 * so the vibecoder spends time on real incidents, not fixtures.             */

/** Values that are pure variable references — the secret lives in the env, not in the code. */
export function isEnvReference(value: string): boolean {
  const v = value.trim();
  return (
    /^\$\{[^}]+\}$/.test(v) || // ${VAR} / ${env:VAR}
    /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v) || // $VAR (shell)
    /^%[A-Za-z0-9_]+%$/.test(v) || // %VAR% (Windows)
    /^process\.env\.[A-Za-z0-9_]+$/.test(v) ||
    /^[A-Z_][A-Z0-9_]{3,}$/.test(v) // BARE_ENV_NAME as a value
  );
}

const FAKE_VALUE_WORDS =
  /(test|fake|dummy|example|sample|placeholder|change[-_]?me|mock|stub|fixture|foo|bar|baz|lorem|ipsum|xxx+|segredo|senha|noop|qwerty|admin|guest|not[-_]?a[-_]?)/i;

/**
 * Mixed-class values of reasonable length behave like real credentials
 * ("Admin@Prod2026", "S3nh4-x9T2!") — placeholder words appearing inside
 * them must NOT downgrade the finding anymore (v0.9 audit fix).
 */
export function looksLikeRealCredential(value: string): boolean {
  return value.length >= 12 && /\d/.test(value) && /[!@#$%^&*._\-+]/.test(value);
}

/** Values that are almost certainly placeholders, not real credentials. */
export function isFakeValue(value: string): boolean {
  if (/^(.)\1+$/.test(value)) return true; // aaaaaaaa
  if (looksLikeRealCredential(value)) return false; // mixed classes → real
  if (FAKE_VALUE_WORDS.test(value)) return true;
  // Names its own kind and is short — real secrets rarely do ("server-secret").
  if (value.length < 32 && /(secret|password|passwd|token)/i.test(value)) return true;
  return false;
}

/** Shannon entropy (bits/char) — detects opaque high-entropy blobs without known prefixes. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Unprefixed high-entropy assignments: `token = "Zq8fJ9x..."`. Identifiers
 * that name hashes/digests are excluded — those are legitimately random.
 */
const ENTROPY_ASSIGN_PATTERN =
  /\b((?:api[_-]?)?key|token|secret|password|passwd|credential)[a-zA-Z0-9_]*\s*[:=]\s*(["'])([A-Za-z0-9+/_-]{20,})\2/gi;
const HASHY_IDENTIFIER = /(hash|digest|sha1|sha256|sha512|md5|checksum|signature|nonce|etag|commit)/i;
const ENTROPY_THRESHOLD = 4.5;

/** Test/spec files and fixture directories. */
export function isTestFile(relPath: string): boolean {
  return (
    /(^|\/)(tests?|__tests__|spec|specs|fixtures?)\//.test(relPath) ||
    /\.(test|spec)\.[a-z]+$/.test(relPath) ||
    /(^|\/)test_[^/]+\.py$/.test(relPath) ||
    /(^|\/)conftest\.py$/.test(relPath)
  );
}

const DEV_DB_PASSWORDS = new Set(['postgres', 'password', 'root', 'test', 'admin', 'user', '']);

/** localhost + dev credentials = ephemeral CI/local container, not a leaked prod URI. */
export function isEphemeralDbUri(password: string, host: string): boolean {
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?$/i.test(host);
  return local && DEV_DB_PASSWORDS.has(password.toLowerCase());
}

export const EXCLUDED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv', 'coverage',
  // Generated/vendored output dirs — scanning them produces noise (minified
  // bundles satisfy or trip heuristics) and users scan their app, not build
  // artefacts. `.vibe/auditignore` remains the per-project escape hatch.
  'out', '.svelte-kit', '.nuxt', '.output', '.vercel', '.turbo',
  '.wrangler', '.cache', '.docusaurus', 'storybook-static', 'docs-build',
  // mkdocs default output (`site/`) and the harness's own generated reports
  // (`.vibe/report/*.html`) — a lone generated index.html is not a web app,
  // and scanning the harness's own output is self-referential noise.
  'site', '.vibe',
];

/** Max findings per file for the secret scan — keeps reports readable on riddled files. */
const MAX_FINDINGS_PER_FILE = 5;

/** Regexes that indicate insecure coding patterns (not literal secrets). */
const WILDCARD_CORS_PATTERN = /cors\(\s*\{[^}]*origin\s*:\s*['"]\*['"]|access-control-allow-origin['"]?\s*[:,]\s*['"]\*/i;
const CREDENTIALS_TRUE_PATTERN = /credentials\s*:\s*true/i;
const COOKIE_SET_PATTERN = /res\.cookie\s*\(|set-cookie|SetCookieOptions/i;
const HTTPONLY_PATTERN = /httponly/i;
const JWT_SIGN_NONE_PATTERN = /jwt\.sign\([^)]*(alg[^)]*none|['"]none['"])/i;
const JWT_SECRET_LITERAL_PATTERN = /jwt\.(sign|verify)\s*\(\s*[^,]+,\s*['"][^'"]{4,}['"]/;
const JWT_DECODE_PATTERN = /jwt\.decode\s*\(/;
const JWT_VERIFY_PATTERN = /jwt\.verify\s*\(/;
const EXPRESS_PATTERN = /require\(\s*['"]express['"]\s*\)|from\s+['"]express['"]|express\(\)/;
const HELMET_PATTERN = /helmet/i;
const SESSION_PATTERN = /req\.session|express-session|res\.cookie\s*\(/i;
const CSRF_MARKER_PATTERN = /csrf|csurf|samesite/i;

/* ─── Taint-lite (v0.9): lexical dataflow windows for the OWASP sinks a
 * regex CAN see. Not AST analysis — windows look at the sink line plus a
 * few following lines for request-derived input. Zero dependencies; when
 * this fires, treat it as a strong lead, not a proof.                      */

const SQL_UNSAFE_SINKS: { label: string; re: RegExp }[] = [
  { label: 'Prisma $queryRawUnsafe/$executeRawUnsafe', re: /\$(queryRawUnsafe|executeRawUnsafe)\s*\(/ },
  { label: 'Drizzle sql.raw()', re: /\bsql\.raw\s*\(/ },
  { label: 'Python f-string SQL', re: /(?:cursor|conn|db|connection)\.execute\(\s*f['"]/ },
];
/** Request-derived markers inside the sink window make raw SQL injectable. */
const TAINT_INPUT_MARKER = /(req\.|request\.|ctx\.args|args\.|params\.|query\.|body\.|inputs?\.)/;
/** Ownership markers near the sink argue AGAINST a BOLA finding. */
const OWNERSHIP_MARKER = /(userId|user_id|ownerId|owner_id|authorId|createdBy|user\.id|owner\b|tenantId)/i;
const SSRF_SINK = /\b(fetch|axios\.(?:get|post|put|delete|request)|got\(|got\.|undici\.fetch|axios\()\s*/;
const SSRF_SAFE_MARKER = /(allowlist|allowList|whitelist|allowedHosts|ALLOWED_HOSTS|isAllowedUrl|assertAllowedHost|validateUrl)/;
const BOLA_SINK = /\.(findUnique|findFirst|findById|findOne|update|delete|deleteMany|updateMany)\b/;
const BODY_LOG_SINK = /(?:console\.(?:log|info|debug|warn|error)|logger\.\w+)\s*\([^)\n]*(?:req\.(?:body|query|headers|cookies)|\{\s*user\b)/;

/**
 * Scans one file's content for taint-lite sinks. Returns at most one finding
 * per sink family (first hit wins — the goal is coverage, not volume).
 */
export function scanTaintLite(content: string, rel: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);

  // 1) SQL injection — raw SQL sinks fed by request input (OWASP A03).
  for (const { label, re } of SQL_UNSAFE_SINKS) {
    re.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      const window = lines.slice(i, i + 4).join('\n');
      // Request-derived markers only: bare `${}` can interpolate internal
      // constants (false positive); input markers are the real signal.
      if (TAINT_INPUT_MARKER.test(window)) {
        findings.push({
          severity: 'critical',
          category: 'injection',
          message: `Possible SQL injection: ${label} receives request-derived input`,
          file: rel,
          fix: 'Use parameterised queries ($queryRaw with Prisma.join, sql template with sql.raw removed, or ORM query builder). Never concatenate or interpolate request input into SQL — an attacker can read or destroy the whole database.',
        });
        break;
      }
    }
  }

  // 2) SSRF — server-side fetch of a user-controlled URL (OWASP A10).
  for (let i = 0; i < lines.length; i++) {
    if (!SSRF_SINK.test(lines[i])) continue;
    const window = lines.slice(Math.max(0, i - 1), i + 3).join('\n');
    if (TAINT_INPUT_MARKER.test(window) && !SSRF_SAFE_MARKER.test(window)) {
      findings.push({
        severity: 'high',
        category: 'injection',
        message: 'Possible SSRF: fetch/axios called with a user-controlled URL',
        file: rel,
        fix: 'Validate the URL against an explicit allowlist of hosts (and pin the protocol to https) BEFORE fetching. User-supplied URLs let attackers reach internal services, cloud metadata endpoints (169.254.169.254) and localhost.',
      });
      break;
    }
  }

  // 3) BOLA/IDOR — object lookup by request id with no ownership filter nearby.
  for (let i = 0; i < lines.length; i++) {
    if (!BOLA_SINK.test(lines[i]) || !/req\.params\./.test(lines[i])) continue;
    const window = lines.slice(Math.max(0, i - 3), i + 6).join('\n');
    if (!OWNERSHIP_MARKER.test(window)) {
      findings.push({
        severity: 'high',
        category: 'injection',
        message: 'Possible BOLA/IDOR: object fetched/updated by req.params id without an ownership check nearby',
        file: rel,
        fix: 'Scope the query to the authenticated owner (e.g. where: { id: req.params.id, userId: req.user.id }) or verify ownership after fetching. Unscoped lookups let any logged-in user read/modify other users\' records by changing the id.',
      });
      break;
    }
  }

  // 4) Full-body/PII logging (LGPD Art. 46 + OWASP A09).
  if (BODY_LOG_SINK.test(content)) {
    findings.push({
      severity: 'high',
      category: 'privacy',
      message: 'Request body/headers/cookies or the whole user object are logged',
      file: rel,
      fix: 'Log only the fields you need (ids, status codes) — never req.body, req.headers or the full user object. Logs commonly ship to third parties and become a PII leak under LGPD.',
    });
  }

  return findings;
}

export async function scanSecrets(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  /* ── auditignore model (v0.9): exclusions suppress with accounting, never
   * silently. Vendor-secret criticals in NON-test files survive the ignore
   * list by design — `.vibe/auditignore` must not become an audit kill-switch.
   * Non-vendor findings in ignored files are skipped but counted and the
   * report always states how much of the project is excluded.               */
  const entries = await loadAuditIgnoreEntries();
  const ignoreSet = await resolveAuditIgnoreFiles(entries.map((e) => e.pattern));
  const suppression = { count: 0, files: new Set<string>() };

  const files = await fg('**/*.{js,ts,jsx,tsx,py,env,json,yaml,yml,toml,sh,bash,go,rb,php,java,cs}', {
    cwd: projectRoot(),
    // Deliberately NOT filtered by auditignore — vendor secrets in non-test
    // files are non-suppressible. Excluded dirs stay excluded.
    ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`)],
    dot: true,
    absolute: true,
    suppressErrors: true,
  });

  // Real .env files hold legitimate local secrets — scanning them produces
  // false positives (whether they are COMMITTED is checked via .gitignore).
  // Templates (.env.example/.sample) SHOULD stay clean, so they stay in scope.
  const filesToCheck = files.filter((f) => {
    const base = f.split('/').pop() ?? '';
    if (base === '.env.example' || base === '.env.sample') return true;
    return !/^\.env(\..+)?$/.test(base);
  });

  const codeFiles: string[] = [];

  for (const file of filesToCheck) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    const rel = file.replace(projectRoot() + '/', '');
    const isCode = /\.(js|ts|jsx|tsx|py|go|rb|php|java|cs)$/i.test(file);
    if (isCode) codeFiles.push(file);
    const inTestFile = isTestFile(rel);

    // Secret patterns — collect several per file (dedup by label, capped).
    const seenLabels = new Set<string>();
    const pushFinding = (f: Finding): void => {
      // Suppression rule (v0.9): ignored files may suppress non-critical
      // findings (with accounting) — but critical findings (vendor secrets,
      // real generic credentials) survive the ignore list unless the file is
      // a scanner fixture (test file). auditignore must not hide incidents.
      if (ignoreSet.has(file) && (inTestFile || f.severity !== 'critical')) {
        suppression.count += 1;
        suppression.files.add(rel);
        return;
      }
      if (seenLabels.size >= MAX_FINDINGS_PER_FILE) return;
      if (seenLabels.has(f.message)) return;
      seenLabels.add(f.message);
      findings.push(f);
    };

    // 1) Vendor/structural patterns — always critical, always 'real'.
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (!VENDOR_LABELS.has(label)) continue;
      if (pattern.test(content)) {
        pushFinding({
          severity: 'critical',
          category: 'secrets',
          message: `Potential ${label} detected`,
          file: rel,
          fix: 'Move this value to an environment variable and add it to .gitignore. Never commit credentials.',
          triage: 'real',
        });
      }
    }

    // 1b) Test-mode keys — committed secrets worth rotating, not live-money critical.
    for (const [pattern, label] of TEST_KEY_PATTERNS) {
      if (pattern.test(content)) {
        pushFinding({
          severity: 'medium',
          category: 'secrets',
          message: `Potential ${label} committed`,
          file: rel,
          fix: 'Test keys still unlock test-mode APIs and often share code paths with live ones. Move the key to an environment variable and rotate it in the Stripe dashboard.',
          triage: 'real',
        });
      }
    }

    // 2) Generic assignments — triage the literal value before scoring.
    for (const { label, re } of GENERIC_VALUE_PATTERNS) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const value = match[2];
        if (isEnvReference(value)) {
          pushFinding({
            severity: 'info',
            category: 'secrets',
            message: `${label} pattern matched a variable reference, not a literal (${value.slice(0, 40)})`,
            file: rel,
            fix: 'No action needed — the value comes from the environment. Verify the variable is provisioned securely.',
            triage: 'env-reference',
          });
        } else if (isFakeValue(value)) {
          pushFinding({
            severity: 'low',
            category: 'secrets',
            message: `Potential ${label} looks like a placeholder (${value.slice(0, 40)})`,
            file: rel,
            fix: 'If this is a real credential, move it to an environment variable. If it is a fixture, add the file to .vibe/auditignore.',
            triage: 'fixture',
          });
        } else if (/\$\{/.test(value)) {
          // Mixed template literal ("pass${suffix}") — dynamic value, cannot
          // be judged lexically: surface as medium for human review.
          pushFinding({
            severity: 'medium',
            category: 'secrets',
            message: `${label} is assembled at runtime from a template literal`,
            file: rel,
            fix: 'Confirm the interpolated parts never embed real credentials in source. Prefer reading the complete value from an environment variable.',
            triage: 'real',
          });
        } else {
          pushFinding({
            severity: inTestFile ? 'medium' : 'critical',
            category: 'secrets',
            message: `Potential ${label} detected${inTestFile ? ' in a test file' : ''}`,
            file: rel,
            fix: inTestFile
              ? 'Test setup with a realistic-looking literal — prefer obviously-fake fixtures, or allowlist the file in .vibe/auditignore.'
              : 'Move this value to an environment variable and add it to .gitignore. Never commit credentials.',
            triage: inTestFile ? 'fixture' : 'real',
          });
        }
        if (seenLabels.size >= MAX_FINDINGS_PER_FILE) break;
      }
    }

    // 2b) Unprefixed high-entropy literals — opaque blobs without a known
    // vendor prefix (`const token = "Zq8fJ..."`). Catches base64/hex-style
    // secrets the prefix families above cannot see.
    ENTROPY_ASSIGN_PATTERN.lastIndex = 0;
    let entropyMatch: RegExpExecArray | null;
    while ((entropyMatch = ENTROPY_ASSIGN_PATTERN.exec(content)) !== null) {
      const identifier = entropyMatch[1];
      const value = entropyMatch[3];
      if (HASHY_IDENTIFIER.test(identifier)) continue; // digests are random by design
      if (isEnvReference(value) || isFakeValue(value)) continue;
      if (shannonEntropy(value) >= ENTROPY_THRESHOLD) {
        pushFinding({
          severity: 'high',
          category: 'secrets',
          message: `High-entropy value assigned to "${identifier}" (no known vendor prefix) — possible opaque secret`,
          file: rel,
          fix: 'If this is a credential, move it to an environment variable. If it is generated data, rename the identifier (e.g. `digest`/`hash`) so the audit can tell them apart.',
          triage: 'real',
        });
      }
    }

    // 3) Connection URIs — triage env references and ephemeral CI databases.
    for (const { label, re } of DB_URI_VALUE_PATTERNS) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const [, , password, host] = match;
        if (isEnvReference(password)) {
          pushFinding({
            severity: 'info',
            category: 'secrets',
            message: `${label} uses an environment-variable password`,
            file: rel,
            fix: 'No action needed — credentials come from the environment.',
            triage: 'env-reference',
          });
        } else if (isEphemeralDbUri(password, host)) {
          pushFinding({
            severity: 'low',
            category: 'secrets',
            message: `${label} points at a local/CI database (${host})`,
            file: rel,
            fix: 'Ephemeral dev/CI container credentials are low risk. If this URI ever points at a shared or prod database, move it to an environment variable.',
            triage: 'ci-ephemeral',
          });
        } else {
          pushFinding({
            severity: 'critical',
            category: 'secrets',
            message: `Potential ${label} detected`,
            file: rel,
            fix: 'Move this value to an environment variable and add it to .gitignore. Never commit credentials.',
            triage: 'real',
          });
        }
        if (seenLabels.size >= MAX_FINDINGS_PER_FILE) break;
      }
    }
  }

  const gitignoreContent = existsSync(join(projectRoot(), '.gitignore'))
    ? await readFile(join(projectRoot(), '.gitignore'), 'utf8')
    : '';
  // Line-based check: a substring match would pass on a comment like "# .env".
  const gitignoreLines = gitignoreContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const ignoresEnv = gitignoreLines.some((l) => /^(\*\*\/|\/)?\.env(\.|$|\*)/.test(l));
  if (!ignoresEnv) {
    findings.push({
      severity: 'high',
      category: 'secrets',
      message: '.env files are not excluded in .gitignore',
      fix: 'Add `.env` and `.env*.local` to your .gitignore file.',
    });
  }

  /* ── Insecure coding patterns (heuristic, per file) ─────────────────────── */
  for (const file of codeFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const rel = file.replace(projectRoot() + '/', '');
    const fileFindings: Finding[] = [];

    if (WILDCARD_CORS_PATTERN.test(content)) {
      const withCredentials = CREDENTIALS_TRUE_PATTERN.test(content);
      fileFindings.push({
        severity: withCredentials ? 'critical' : 'high',
        category: 'secrets',
        message: withCredentials
          ? 'Wildcard CORS origin combined with credentials:true — any site can make authenticated cross-origin requests'
          : 'Wildcard CORS origin (*) configured',
        file: rel,
        fix: 'Restrict `origin` to an explicit allowlist of your domains and keep `credentials` off unless required. Wildcard + credentials violates the CORS spec and leaks authenticated data.',
      });
    }

    if (COOKIE_SET_PATTERN.test(content) && !HTTPONLY_PATTERN.test(content)) {
      fileFindings.push({
        severity: 'medium',
        category: 'secrets',
        message: 'Cookies set without httpOnly/secure/sameSite flags detected',
        file: rel,
        fix: 'Set cookies with `httpOnly: true`, `secure: true` (HTTPS), and `sameSite: \'lax\'|\'strict\'` to prevent theft and CSRF.',
      });
    }

    if (JWT_SIGN_NONE_PATTERN.test(content)) {
      fileFindings.push({
        severity: 'critical',
        category: 'secrets',
        message: 'JWT signed with "none" algorithm — tokens can be forged',
        file: rel,
        fix: 'Never allow `alg: none`. Pin the algorithm explicitly (e.g., HS256 with a strong secret or RS256) on both sign and verify.',
      });
    } else if (JWT_SECRET_LITERAL_PATTERN.test(content)) {
      fileFindings.push({
        severity: 'high',
        category: 'secrets',
        message: 'JWT secret hardcoded in source',
        file: rel,
        fix: 'Load the JWT secret from an environment variable (`process.env.JWT_SECRET`) and rotate it. A committed secret lets anyone forge tokens.',
      });
    }

    if (JWT_DECODE_PATTERN.test(content) && !JWT_VERIFY_PATTERN.test(content)) {
      fileFindings.push({
        severity: 'high',
        category: 'secrets',
        message: 'JWT decoded with jwt.decode() without signature verification (jwt.verify)',
        file: rel,
        fix: '`jwt.decode` does NOT verify the signature — anyone can forge the payload. Use `jwt.verify(token, secret)` for anything security-relevant.',
      });
    }

    // Test fixtures routinely instantiate express/session without helmet/CSRF
    // and that says nothing about the real app — triage them like other checks.
    if (!isTestFile(rel) && EXPRESS_PATTERN.test(content) && !HELMET_PATTERN.test(content)) {
      fileFindings.push({
        severity: 'medium',
        category: 'secrets',
        message: 'Express app without security-headers middleware (helmet)',
        file: rel,
        fix: 'Add `helmet()` early in the middleware chain to set CSP, HSTS, X-Frame-Options and other security headers.',
      });
    }

    if (!isTestFile(rel) && SESSION_PATTERN.test(content) && !CSRF_MARKER_PATTERN.test(content)) {
      fileFindings.push({
        severity: 'medium',
        category: 'secrets',
        message: 'Cookie/session-based auth without CSRF protection markers detected',
        file: rel,
        fix: 'Use SameSite cookies plus a CSRF token (or double-submit cookie) on all state-changing routes. Without it, third-party sites can forge authenticated requests.',
      });
    }

    // Taint-lite sinks (v0.9) — skipped for test fixtures like the rest.
    if (!isTestFile(rel)) {
      fileFindings.push(...scanTaintLite(content, rel));
    }

    // Commit or suppress the file's heuristic findings (same v0.9 rule:
    // ignored test files suppress everything; ignored non-test files
    // suppress everything except criticals).
    if (fileFindings.length > 0 && ignoreSet.has(file)) {
      const survivors = isTestFile(rel) ? [] : fileFindings.filter((f) => f.severity === 'critical');
      suppression.count += fileFindings.length - survivors.length;
      if (survivors.length < fileFindings.length) suppression.files.add(rel);
      findings.push(...survivors);
    } else {
      findings.push(...fileFindings);
    }
  }

  /* ── auditignore hygiene — exclusions must stay narrow and documented ───── */
  for (const entry of entries) {
    if (isOverlyBroadPattern(entry.pattern)) {
      findings.push({
        severity: 'high',
        category: 'auditignore',
        message: `.vibe/auditignore entry "${entry.pattern}" is overly broad — it suppresses findings for a whole tree`,
        fix: 'Narrow the pattern to the specific files with known false positives and document each entry inline: `path # reason`. An exclusion this wide is an audit kill-switch.',
      });
    }
  }
  const undocumentedEntries = entries.filter((e) => !e.reason).length;
  if (entries.length > 0) {
    findings.push({
      severity: 'info',
      category: 'auditignore',
      message:
        `.vibe/auditignore active: ${entries.length} pattern(s) covering ${ignoreSet.size} file(s); ` +
        `${suppression.count} finding(s) suppressed this run` +
        (undocumentedEntries > 0 ? `; ${undocumentedEntries} entry(ies) missing an inline reason` : '') +
        '. Suppressed is not safe — review exclusions regularly.',
      fix: 'Keep every exclusion narrow, temporary and documented inline (`path # reason`).',
    });
  }

  /* ── guardrails tamper detection (v0.9) — constitution, .gitignore .env
   * entry, pre-commit hook and core.hooksPath vs the init baseline.       */
  findings.push(...(await verifyGuardrails()));

  const maxScore = 30;
  const deductions = findings.reduce(
    (acc, f) =>
      acc +
      (f.severity === 'critical' ? 20 : f.severity === 'high' ? 10 : f.severity === 'medium' ? 5 : f.severity === 'low' ? 2 : 0),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}

interface AuditCounts {
  critical: number;
  high: number;
  moderate: number;
}

const AUDIT_ARGS: Record<string, string[]> = {
  npm: ['audit', '--json'],
  pnpm: ['audit', '--json'],
  yarn: ['npm', 'audit', '--json'],
  bun: ['audit', '--json'],
};

/** npm and pnpm both emit `metadata.vulnerabilities` in their JSON audits. */
function parseNpmStyleAudit(report: unknown): AuditCounts | null {
  const vuln = (report as { metadata?: { vulnerabilities?: Partial<AuditCounts> } } | null)
    ?.metadata?.vulnerabilities;
  if (!vuln) return null;
  return { critical: vuln.critical ?? 0, high: vuln.high ?? 0, moderate: vuln.moderate ?? 0 };
}

/** yarn berry `yarn npm audit --json` emits NDJSON — one record per advisory. */
function parseYarnAudit(stdout: string): AuditCounts | null {
  const counts: AuditCounts = { critical: 0, high: 0, moderate: 0 };
  let sawRecord = false;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as { value?: { severity?: string; type?: string } };
      const severity = rec.value?.severity;
      if (!severity || rec.value?.type === 'SUMMARY') continue;
      sawRecord = true;
      if (severity === 'critical') counts.critical++;
      else if (severity === 'high') counts.high++;
      else if (severity === 'moderate' || severity === 'medium') counts.moderate++;
    } catch { /* not a JSON record — ignore */ }
  }
  return sawRecord ? counts : null;
}

export async function scanDependencies(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];
  const maxScore = 10;
  const root = projectRoot();

  if (!existsSync(join(root, 'package.json'))) {
    return { score: maxScore, maxScore, findings: [] };
  }

  const pm = detectPackageManager(root);
  const auditArgs = AUDIT_ARGS[pm];
  if (!auditArgs) {
    findings.push({
      severity: 'info',
      category: 'dependencies',
      message: `Dependency audit is not supported for package manager "${pm}"`,
      fix: 'Run your package manager\'s audit command manually and review the advisories.',
    });
    return { score: maxScore, maxScore, findings };
  }

  let stdout: string;
  try {
    // Vulnerable trees make the audit exit non-zero — stdout still carries
    // the report, so the catch branch below is the normal "findings" path.
    const result = await execFileAsync(pm, auditArgs, { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err: unknown) {
    stdout = (err as { stdout?: string }).stdout ?? '';
    if (!stdout && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      findings.push({
        severity: 'info',
        category: 'dependencies',
        message: `${pm} not found on PATH — dependency audit skipped`,
        fix: `Install ${pm} (or run \`npm audit\` / \`pnpm audit\`) so CVEs in dependencies are checked.`,
      });
      return { score: maxScore, maxScore, findings };
    }
  }

  let parsed: unknown = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch { /* yarn NDJSON and partial outputs are handled per-pm below */ }

  const counts =
    pm === 'yarn' ? parseYarnAudit(stdout) : parsed !== null ? parseNpmStyleAudit(parsed) : null;

  if (!counts) {
    // Never fail silently: an unparseable audit used to score 10/10 with
    // zero findings, hiding CVEs from the user.
    findings.push({
      severity: 'info',
      category: 'dependencies',
      message: `Dependency audit produced no parseable report (${pm}) — verify manually`,
      fix: `Run \`${pm} audit\`${pm === 'yarn' ? ' (or `yarn npm audit`)' : ''} in the project and review the advisories.`,
    });
    return { score: maxScore, maxScore, findings };
  }

  if (counts.critical > 0) {
    findings.push({
      severity: 'critical',
      category: 'dependencies',
      message: `${counts.critical} critical CVEs in dependencies`,
      fix: `Run \`${pm} audit fix\` or upgrade the affected packages. Check https://security.snyk.io for details.`,
    });
  }
  if (counts.high > 0) {
    findings.push({
      severity: 'high',
      category: 'dependencies',
      message: `${counts.high} high-severity CVEs in dependencies`,
      fix: `Run \`${pm} audit fix\` to resolve. Review packages with \`${pm} audit\` for details.`,
    });
  }
  if (counts.moderate > 0) {
    findings.push({
      severity: 'medium',
      category: 'dependencies',
      message: `${counts.moderate} moderate CVEs in dependencies`,
      fix: `Run \`${pm} audit\` and evaluate upgrades for affected packages.`,
    });
  }

  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'critical' ? 10 : f.severity === 'high' ? 5 : 2),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
