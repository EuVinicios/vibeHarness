/**
 * LGPD Brasil Compliance Scanner
 * Lei Geral de Proteção de Dados — Lei nº 13.709/2018
 *
 * Checks for:
 *  1. PII leakage in logs (CPF, e-mail, phone, passwords)
 *  2. Cookie consent / banner detection
 *  3. Mandatory privacy pages (/politica-de-privacidade, /privacy, /terms)
 *  4. Data Subject Rights (DSR) endpoints (delete, export)
 *  5. Row-Level Security (Supabase / PostgreSQL)
 *  6. Secure password hashing (no plaintext / MD5 / SHA1)
 */

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS } from './security.js';

/* ─── Patterns ─────────────────────────────────────────────────────────────── */

/** Detects PII being printed/logged without masking — literal PII values.
 * The argument window runs to end-of-line (`[^\n]*`): a `)` from an earlier
 * helper call (`console.log(getUser(), 'a@b.co')`) used to blind every
 * pattern at the first closing paren. Formatted CPFs moved to a dedicated
 * checksum-validated loop (scanFormattedCpfInLogs). */
const PII_LOG_PATTERNS: [RegExp, string][] = [
  // E-mail in logs
  [
    /console\.(log|error|warn|info|debug)\s*\([^\n]*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    'E-mail address in log statement',
  ],
  // Phone number in logs (BR format) — requires an explicit marker (+55) or
  // at least one separator, so contiguous digit runs (Unix timestamps,
  // order IDs) are never flagged.
  [
    /console\.(log|error|warn|info|debug)\s*\([^\n]*(?:\+55[\s-]?\(?\d{2}\)?[\s-]?\d{4,5}[-\s]?\d{4}|\(\d{2}\)[\s-]?\d{4,5}[-\s]\d{4}|\b\d{2}[\s-]\d{4,5}[\s-]\d{4}\b)/,
    'Phone number in log statement',
  ],
];

/** Formatted CPF candidates inside log statements (###.###.###-## — the
 * separators may also be spaces). Checksum-validated before flagging. */
const FORMATTED_CPF_LOG_RE =
  /console\.(log|error|warn|info|debug)\s*\([^\n]*\b(\d{3}[.\s]\d{3}[.\s]\d{3}[-\s]\d{2})\b/g;

/** Bare 11-digit candidate CPFs inside log statements. */
const BARE_CPF_LOG_RE = /console\.(log|error|warn|info|debug)\s*\([^\n]*\b(\d{11})\b/g;

/** CPF check-digit validation (Receita Federal algorithm). Rejects sequences
 * like 111.111.111-11 and every non-CPF 11-digit number (IDs, timestamps). */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/**
 * Sensitive *field names* in log statements — triaged (v0.8): a keyword inside
 * a static message ('Error resetting password:') is not PII leakage; a keyword
 * interpolated with data or logged as a value is.
 */
const SENSITIVE_FIELD_LOG_RE =
  /console\.(log|error|warn|info|debug)\s*\(([^\n]*)\b(password|senha|token|secret|cpf|rg)\b/gi;
const SENSITIVE_FIELD_PRINT_RE = /print\s*\(([^\n]*)\b(password|senha|cpf|email|token|secret)\b/gi;

/**
 * Returns the quote character surrounding `index` in `src` ('"', "'", '`'),
 * plus the position of the opening quote, or nulls when the position is
 * outside any string literal.
 */
function quoteStateAt(src: string, index: number): { quote: string | null; openIndex: number } {
  let quote: string | null = null;
  let openIndex = -1;
  for (let i = 0; i < index && i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (quote === null && (ch === '"' || ch === "'" || ch === '`')) {
      quote = ch;
      openIndex = i;
    } else if (quote === ch) {
      quote = null;
      openIndex = -1;
    }
  }
  return { quote, openIndex };
}

/**
 * Classify a sensitive-keyword log match using the whole call line:
 * - keyword outside any quotes (logged as a value) → dynamic
 * - keyword inside a template literal that interpolates data → dynamic
 * - keyword inside a Python f-string, or a `.format()` / `%` expression → dynamic
 * - keyword inside a plain static string → static (no data logged)
 */
function triageSensitiveLog(callLine: string, kwIndex: number): 'dynamic' | 'static' {
  const { quote, openIndex } = quoteStateAt(callLine, kwIndex);
  if (quote === null) return 'dynamic';
  if (quote === '`') return callLine.includes('${') ? 'dynamic' : 'static';
  // Python f-string: the opening quote is immediately prefixed with `f`.
  if (openIndex > 0 && /[fF]/.test(callLine[openIndex - 1])) return 'dynamic';
  if (/\.format\s*\(|%\s*[(sd]/.test(callLine)) return 'dynamic';
  return 'static';
}

/**
 * Conservative comment stripper: removes JS block comments (slash-asterisk),
 * HTML comments and `// …` line comments (unless part of a URL, `://`) so
 * commented-out code, JSDoc examples and TODO notes never satisfy detection
 * heuristics. Not a parser — good enough for heuristic scanning.
 */
export function stripLineComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

/** SQL `--` line-comment stripper for migration/policy files. */
export function stripSqlComments(src: string): string {
  return src.replace(/(^|[^:'"`])--[^\n]*/g, '$1');
}

/** Insecure password hashing — labels are context-neutral: md5/sha1 also have
 * legitimate non-password uses (Gravatar, ETags, cache keys), and the old
 * "used for password/data" claim could not be verified by the regex. */
const WEAK_HASH_PATTERNS: [RegExp, string][] = [
  [/md5\s*\(/i, 'MD5 hash detected (cryptographically broken) — verify it is not used for passwords or signatures'],
  [/sha1\s*\(/i, 'SHA1 hash detected (weak) — verify it is not used for passwords or signatures'],
  [/createHash\s*\(\s*['"]md5['"]/i, 'Node.js MD5 hash detected — verify it is not used for passwords or signatures'],
  [/createHash\s*\(\s*['"]sha1['"]/i, 'Node.js SHA1 hash detected — verify it is not used for passwords or signatures'],
  [/hashlib\.(md5|sha1)\s*\(/i, 'Python MD5/SHA1 hash detected — verify it is not used for passwords or signatures'],
];

const CONSENT_MARKERS = [
  'cookie-consent',
  'cookieconsent',
  'cookie_consent',
  'consentimento',
  // NOTE: 'gtag' is NOT a consent marker — Google Analytics loads without
  // any consent mechanism. Only real consent platforms/patterns count.
  // NOTE: bare 'lgpd'/'gdpr' words are NOT markers either — prose like
  // "estamos em conformidade com a LGPD" satisfies no banner; they only
  // count paired with a consent-mechanism word (CONSENT_PROSE_RE).
  'CookieYes',
  'OneTrust',
  'Cookiebot',
];

/** LGPD/GDPR words count as consent evidence only beside a mechanism word. */
const CONSENT_PROSE_RE =
  /(lgpd|gdpr)[\w\s.,-]{0,40}(banner|consentimento|consent|modal|notice|aceite|accept|opt[\s-]?in)|(banner|consentimento|consent|modal|notice|aceite|accept|opt[\s-]?in)[\w\s.,-]{0,40}(lgpd|gdpr)/i;

const PRIVACY_ROUTES = [
  '/politica-de-privacidade',
  '/privacy',
  '/privacy-policy',
  '/politica-privacidade',
];

const TERMS_ROUTES = [
  '/termos-de-uso',
  '/terms',
  '/terms-of-service',
  '/termos',
];

/**
 * DSR evidence — HTTP routes AND Supabase/PostgreSQL RPCs/functions.
 * v0.8: projects implementing LGPD Art. 18 via `supabase.rpc('delete_own_account')`
 * or SQL functions were false negatives when only route syntax was recognised.
 */
const DSR_DELETE_PATTERNS = [
  /delete\s+['"`]\/api\/(user|account|me|usuario|conta)/i,
  // Any receiver: router.delete, app.delete, fastify.delete, axios.delete,
  // ky.delete, supabase.from(...).delete('/user')…
  /\b\w+\.(delete|del)\s*\(\s*['"`][^'"`]*\/(user|account|me|usuario|conta)\b/i,
  /route\s*\(\s*['"`]delete['"`]\s*,\s*['"`][^'"]*\/(user|account|me|usuario|conta)/i,
  /@Delete\s*\(\s*['"`][^'"]*\/(user|account|me|usuario|conta)/i,
  // fetch('/api/user', { method: 'DELETE' }) and variants — v0.8.3: the
  // window is bounded tighter so an unrelated DELETE elsewhere in the file
  // plus any `/user` string within reach no longer fakes deletion evidence.
  /(fetch|axios|ky|got)\s*\(\s*['"`][^'"`]*\/(user|account|me|usuario|conta)[^'"`]*['"`][\s\S]{0,60}?method\s*:\s*['"`]delete['"`]/i,
  /method\s*:\s*['"`]delete['"`][\s\S]{0,60}?['"`]\/(\w+\/)*(user|account|me|usuario|conta)\b/i,
  // Next.js App Router handler in a user/account route file — detected by
  // file path + `export function DELETE` in scanLGPD itself.
  /\.rpc\(\s*['"`](delete[_-]?(own[_-]?)?(account|user|conta|usuario)|(account|user|conta|usuario)[_-]?delete)['"`]/i,
  /create\s+(?:or\s+replace\s+)?function\s+(delete[_-]?(own[_-]?)?(account|user|conta|usuario)|(account|user|conta|usuario)[_-]?delete)\s*\(/i,
];

const DSR_EXPORT_PATTERNS = [
  // Bounded window: `export` as an ES keyword plus `.*` used to span the
  // whole file, so any `/user/data` nav link satisfied portability.
  /export[\s\S]{0,80}?\/(user|account|me|usuario|conta)\/(data|dados|export|exportar)/i,
  // Path-first forms: app.get('/api/user/export'), GET /user/data…
  /(get|route)\s*\(\s*['"`][^'"`]*\/(user|account|me|usuario|conta)\/(data|dados|export|exportar)/i,
  /download[\s\S]{0,80}?\/(user|account|me|usuario|conta)\/(data|dados)/i,
  /portabilidade/i,
  /'data.?export'|"data.?export"|`data.?export`/i,
  /\.rpc\(\s*['"`](export[_-]?(own[_-]?)?(user[_-]?)?data|user[_-]?data[_-]?export|exportar[_-]?dados)['"`]/i,
  /create\s+(?:or\s+replace\s+)?function\s+(export[_-]?(own[_-]?)?(user[_-]?)?data|user[_-]?data[_-]?export)\s*\(/i,
];

/** Next.js App Router resource-route detection — the resource name may be
 * followed by dynamic segments (`app/api/user/[id]/route.ts`). */
const APP_ROUTER_RESOURCE_ROUTE_RE =
  /(^|\/)(user|account|me|usuario|conta)s?(\/[^/]*)*\/route\.(ts|js|tsx|jsx)$/;
/** Both handler forms: `export function DELETE` and `export const DELETE =`. */
const APP_ROUTER_DELETE_HANDLER_RE =
  /export\s+(?:async\s+)?(?:function\s+DELETE|const\s+DELETE\s*=)/;

/**
 * Persistence detection — DSR obligations (erasure/portability) only exist
 * when user data is actually stored. Checks common Node/Python persistence
 * dependencies plus migration/schema artefacts on disk.
 */
export function hasPersistence(root: string = projectRoot()): boolean {
  const PERSISTENCE_DEPS = [
    '@supabase/supabase-js',
    'prisma',
    '@prisma/client',
    'drizzle-orm',
    'typeorm',
    'sequelize',
    'kysely',
    'knex',
    'mongoose',
    'mongodb',
    'mysql',
    'mysql2',
    'pg',
    'sqlite3',
    'better-sqlite3',
    'firebase-admin',
    'firebase',
    '@aws-sdk/client-dynamodb',
  ];
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (PERSISTENCE_DEPS.some((d) => deps[d])) return true;
  } catch {
    /* no package.json — fall through to file checks */
  }
  const artefacts = [
    join(root, 'prisma', 'schema.prisma'),
    join(root, 'drizzle.config.ts'),
    join(root, 'drizzle.config.js'),
    join(root, 'migrations'),
    join(root, 'src', 'migrations'),
    join(root, 'db', 'migrations'),
  ];
  return artefacts.some((p) => existsSync(p));
}

const RLS_CHECK_PATTERNS = [
  /enable row level security/i,
  /alter table.*enable rls/i,
  /create policy/i,
  /row_security\s*=\s*on/i,
  /\.enableRLS\s*\(/i,
];

const PLAINTEXT_PASSWORD_PATTERNS: [RegExp, string][] = [
  [/password\s*=\s*req\.(body|json)\s*\.\s*password\s*(?!.*hash|.*bcrypt|.*argon)/, 'Possible plaintext password stored without hashing'],
  [/user\.password\s*=\s*password\s*(?!.*hash|.*bcrypt|.*argon)/, 'Possible plaintext password assignment without hashing'],
];

/**
 * INSERT statements that mention a password column. The hashing guard is
 * checked against the whole matched statement (a trailing negative
 * lookahead after `.*` is vacuous — it always succeeds at end-of-line, so
 * the old inline guard never excluded anything). Supports `$1` and `?`
 * placeholders alike. v0.8.3: the bounded `[\s\S]` windows also match
 * multi-line statements (template literals — the common style for raw SQL);
 * the pre-0.8.3 `[^;\n]*` form made them completely invisible.
 */
const INSERT_PASSWORD_RE = /INSERT\s+INTO[\s\S]{0,400}?password[\s\S]{0,400}?VALUES/gi;
const HASHING_GUARD_RE = /hash|bcrypt|argon|crypt|pbkdf2?|scrypt/i;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

async function getSourceFiles(
  extensions: string,
  extraIgnore: string[] = []
): Promise<string[]> {
  return fg(`**/*.{${extensions}}`, {
    cwd: projectRoot(),
    ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...extraIgnore],
    dot: true,
    absolute: true,
    suppressErrors: true,
  });
}

/**
 * Route/handler markers — presence indicates an HTTP API surface.
 * Deliberately excludes generic tokens like `req.body` / `req, res`, which
 * appear in documentation and rule templates without any real route existing.
 */
export const API_SURFACE_PATTERN =
  /app\.(get|post|put|patch|delete|use)\s*\(\s*['"`/]|router\.(get|post|put|patch|delete)\s*\(\s*['"`/]|@(Controller|Get|Post|Put|Delete|Route)\b|fastify\.(get|post|put|delete)\s*\(|@(app|ctr)\.(Get|Post|Put|Delete)/;

/**
 * True when the project exposes a web surface (UI components or HTTP routes).
 * Pure CLIs/libraries skip the web-only LGPD checks (consent banner, privacy
 * pages, DSR endpoints) — they are web-application obligations (LGPD Art. 8/9/18
 * apply to data controllers operating user-facing services, not dev tooling).
 */
export async function hasWebSurface(uiFiles: string[], sourceFiles: string[]): Promise<boolean> {
  if (uiFiles.length > 0) return true;
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (API_SURFACE_PATTERN.test(content)) return true;
  }
  return false;
}

async function searchInFiles(
  patterns: [RegExp, string][],
  files: string[],
  severity: Finding['severity'],
  category: string,
  fix: string,
  options: { stripComments?: boolean } = {}
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (options.stripComments) content = stripLineComments(content);
    for (const [pattern, label] of patterns) {
      if (pattern.test(content)) {
        findings.push({
          severity,
          category,
          message: label,
          file: file.replace(projectRoot() + '/', ''),
          fix,
        });
        break; // one finding per file per category
      }
    }
  }
  return findings;
}

/* ─── Main scanner ─────────────────────────────────────────────────────────── */

export async function scanLGPD(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const auditIgnores = await loadAuditIgnores();
  const sourceFiles = await getSourceFiles('js,ts,jsx,tsx,py', auditIgnores);
  const uiFiles = await getSourceFiles('jsx,tsx,html,svelte,vue', auditIgnores);
  const allFiles = await getSourceFiles('js,ts,jsx,tsx,py,html,svelte,vue', auditIgnores);
  const root = projectRoot();
  const isWebApp = await hasWebSurface(uiFiles, sourceFiles);
  if (!isWebApp) {
    findings.push({
      severity: 'info',
      category: 'lgpd-scope',
      message: 'No web surface detected (no UI components or HTTP routes) — web-only LGPD checks skipped',
      fix: 'Not applicable to CLI/library projects. If this project grows a web UI or API, the consent, privacy-page and DSR checks activate automatically.',
    });
  }

  /* 1. PII in logs */
  const piiFindings = await searchInFiles(
    PII_LOG_PATTERNS,
    sourceFiles,
    'high',
    'lgpd-pii-logs',
    'Use a logging library with field masking (e.g., pino redact) and never log CPF, e-mail, phone, password, or tokens. Instrument with `logger.info({ userId }, "msg")` instead of logging the full user object.',
    { stripComments: true }
  );
  findings.push(...piiFindings);

  /* 1a-i. Bare 11-digit numbers in logs — only flagged when the value passes
   * CPF check-digit validation (numeric IDs and timestamps never match). */
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    BARE_CPF_LOG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BARE_CPF_LOG_RE.exec(content)) !== null) {
      if (isValidCpf(m[2])) {
        findings.push({
          severity: 'high',
          category: 'lgpd-pii-logs',
          message: 'CPF number in log statement',
          file: file.replace(projectRoot() + '/', ''),
          fix: 'Use a logging library with field masking (e.g., pino redact) and never log CPF values. Log opaque identifiers instead.',
        });
        break; // one finding per file
      }
    }
    // Formatted CPFs (###.###.###-##, space-grouped included) also require a
    // valid checksum — quantities/lot numbers like "100 200 300 05" share the
    // shape and used to be flagged on formatting alone.
    FORMATTED_CPF_LOG_RE.lastIndex = 0;
    let fm: RegExpExecArray | null;
    while ((fm = FORMATTED_CPF_LOG_RE.exec(content)) !== null) {
      if (isValidCpf(fm[2].replace(/\D/g, ''))) {
        findings.push({
          severity: 'high',
          category: 'lgpd-pii-logs',
          message: 'CPF number in log statement',
          file: file.replace(projectRoot() + '/', ''),
          fix: 'Use a logging library with field masking (e.g., pino redact) and never log CPF values. Log opaque identifiers instead.',
        });
        break; // one finding per file (bare loop may have fired already)
      }
    }
  }

  /* 1b. Sensitive field NAMES in logs — triaged (v0.8).
   * 'Error resetting password:' (static message, no data) is not leakage;
   * interpolated values or logged identifiers are. Static matches are not
   * scored — one info finding summarises how many were triaged away. */
  let staticMessageMatches = 0;
  for (const file of sourceFiles) {
    let content: string;
    try {
      // Commented-out code (`// console.log(password)`) is not live logging.
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    const rel = file.replace(projectRoot() + '/', '');
    let dynamicHit = false;

    for (const re of [SENSITIVE_FIELD_LOG_RE, SENSITIVE_FIELD_PRINT_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const keyword = m[m.length - 1];
        // Use the full call line (not just the arg group, which stops at the
        // first ')') so template-literal interpolation `${...}` is visible.
        const lineStart = content.lastIndexOf('\n', m.index) + 1;
        let lineEnd = content.indexOf('\n', m.index);
        if (lineEnd === -1) lineEnd = content.length;
        const callLine = content.slice(lineStart, lineEnd);
        const kwIndex = m.index + m[0].lastIndexOf(keyword) - lineStart;
        if (triageSensitiveLog(callLine, kwIndex) === 'dynamic') {
          dynamicHit = true;
          break;
        }
        staticMessageMatches++;
      }
      if (dynamicHit) break;
    }

    if (dynamicHit) {
      findings.push({
        severity: 'high',
        category: 'lgpd-pii-logs',
        message: 'Sensitive field value in log statement',
        file: rel,
        triage: 'real',
        fix: 'Use a logging library with field masking (e.g., pino redact) and never log passwords, tokens, CPF or RG. Log opaque identifiers instead (`logger.info({ userId }, "msg")`).',
      });
    }
  }
  if (staticMessageMatches > 0) {
    findings.push({
      severity: 'info',
      category: 'lgpd-pii-logs',
      message: `${staticMessageMatches} log statement(s) mention sensitive words in static messages only — triaged, no data logged`,
      triage: 'static-message',
      fix: 'No action required. Static messages like "Error resetting password:" carry no personal data and are not scored.',
    });
  }

  /* 2. Cookie consent (comments don't count — a TODO note is not a banner) */
  let hasConsent = false;
  for (const file of uiFiles) {
    let content: string;
    try {
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (
      CONSENT_MARKERS.some((m) => content.toLowerCase().includes(m.toLowerCase())) ||
      CONSENT_PROSE_RE.test(content)
    ) {
      hasConsent = true;
      break;
    }
  }
  if (!hasConsent && uiFiles.length > 0) {
    findings.push({
      severity: 'medium',
      category: 'lgpd-consent',
      message: 'No cookie consent / LGPD banner detected in UI files',
      fix: 'Add a cookie consent mechanism (e.g., CookieYes, OneTrust, or a custom banner) that blocks trackers until the user accepts. This is required by LGPD Art. 8 and ANPD guidance.',
    });
  }

  /* 3. Privacy & terms pages (web apps only) */
  let hasPrivacyPage = false;
  let hasTermsPage = false;
  if (isWebApp) {
  for (const file of allFiles) {
    let content: string;
    try {
      // A route mentioned only in a comment is not a page.
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (!hasPrivacyPage && PRIVACY_ROUTES.some((r) => content.includes(r))) hasPrivacyPage = true;
    if (!hasTermsPage && TERMS_ROUTES.some((r) => content.includes(r))) hasTermsPage = true;
  }
  // Also check page directory structure
  const pageDirs = ['pages', 'app', 'src/pages', 'src/app', 'routes'];
  for (const dir of pageDirs) {
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) continue;
    const pageFiles = await fg('**/*', {
      cwd: fullDir,
      suppressErrors: true,
    });
    if (!hasPrivacyPage && pageFiles.some((f) =>
      PRIVACY_ROUTES.some((r) => f.toLowerCase().includes(r.replace('/', '')))
    )) hasPrivacyPage = true;
    if (!hasTermsPage && pageFiles.some((f) =>
      TERMS_ROUTES.some((r) => f.toLowerCase().includes(r.replace('/', '')))
    )) hasTermsPage = true;
  }
  if (!hasPrivacyPage) {
    findings.push({
      severity: 'medium',
      category: 'lgpd-pages',
      message: 'No Privacy Policy page detected (/politica-de-privacidade or /privacy)',
      fix: 'Create a Privacy Policy page accessible at /politica-de-privacidade (or /privacy) describing data collection, storage, and user rights per LGPD Art. 9.',
    });
  }
  if (!hasTermsPage) {
    findings.push({
      severity: 'low',
      category: 'lgpd-pages',
      message: 'No Terms of Use page detected (/termos-de-uso or /terms)',
      fix: 'Create a Terms of Use page accessible at /termos-de-uso (or /terms).',
    });
  }
  }

  /* 4. DSR endpoints (web apps with persistence only) — erasure/portability
   * obligations exist when user data is actually stored. HTTP routes,
   * Supabase RPCs and SQL functions alike (v0.8: `delete_own_account()`/
   * `export_user_data()` were false negatives with route syntax only). */
  if (isWebApp && !hasPersistence(root)) {
    findings.push({
      severity: 'info',
      category: 'lgpd-dsr',
      message: 'Web surface without a detected persistence layer — DSR endpoint checks skipped',
      fix: 'No stored user data, no erasure/portability endpoints needed yet. If the project starts persisting user data (DB dependency, prisma/drizzle config, migrations), these checks activate automatically.',
    });
  }
  if (isWebApp && hasPersistence(root)) {
  let hasDeletion = false;
  let hasExport = false;
  const dsrFiles = [
    ...sourceFiles,
    ...(await fg('**/*.sql', {
      cwd: root,
      ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...auditIgnores],
      absolute: true,
      suppressErrors: true,
    })),
  ];
  for (const file of dsrFiles) {
    let content: string;
    try {
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (!hasDeletion && DSR_DELETE_PATTERNS.some((p) => p.test(content))) hasDeletion = true;
    if (!hasExport && DSR_EXPORT_PATTERNS.some((p) => p.test(content))) hasExport = true;
    // Next.js App Router: DELETE handler (function or const form) inside a
    // route file whose path names the account resource — dynamic segments
    // (`app/api/user/[id]/route.ts`) included.
    if (!hasDeletion && APP_ROUTER_RESOURCE_ROUTE_RE.test(file) && APP_ROUTER_DELETE_HANDLER_RE.test(content)) {
      hasDeletion = true;
    }
  }
  if (!hasDeletion) {
    findings.push({
      severity: 'high',
      category: 'lgpd-dsr',
      message: 'No account/data deletion endpoint detected (LGPD Art. 18 — Right to erasure)',
      fix: 'Implement a DELETE /api/user (or equivalent) endpoint that permanently removes or anonymises all personal data for the authenticated user. Log the deletion event for audit purposes.',
    });
  }
  if (!hasExport) {
    findings.push({
      severity: 'medium',
      category: 'lgpd-dsr',
      message: 'No data export / portability endpoint detected (LGPD Art. 18 — Data portability)',
      fix: 'Implement a GET /api/user/export endpoint that returns all stored data for the user in a machine-readable format (JSON/CSV). This is the "portabilidade de dados" right under LGPD Art. 18, V.',
    });
  }
  }

  /* 5. Row-Level Security */
  const sqlFiles = await fg('**/*.{sql,ts,js,py}', {
    cwd: root,
    ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...auditIgnores],
    absolute: true,
    suppressErrors: true,
  });
  const hasSupabase =
    existsSync(join(root, 'node_modules', '@supabase')) ||
    // A fresh checkout without `npm install` still declares the dependency.
    (() => {
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        return Boolean(
          pkg.dependencies?.['@supabase/supabase-js'] ?? pkg.devDependencies?.['@supabase/supabase-js']
        );
      } catch {
        return false;
      }
    })();
  const hasPrisma = existsSync(join(root, 'prisma', 'schema.prisma'));
  if (hasSupabase || hasPrisma) {
    let hasRLS = false;
    for (const file of sqlFiles) {
      let content: string;
      try {
        // SQL `--` comments stripped: a commented-out `CREATE POLICY` in a
        // migration used to fake RLS evidence and suppress this finding.
        content = stripSqlComments(stripLineComments(await readFile(file, 'utf8')));
      } catch {
        continue;
      }
      if (RLS_CHECK_PATTERNS.some((p) => p.test(content))) {
        hasRLS = true;
        break;
      }
    }
    if (!hasRLS) {
      findings.push({
        severity: 'critical',
        category: 'lgpd-rls',
        message: 'Database detected (Supabase/PostgreSQL) but no Row-Level Security (RLS) policies found',
        fix: 'Enable RLS on every table that stores user data: `ALTER TABLE users ENABLE ROW LEVEL SECURITY;` and create policies. Without RLS, any authenticated user can read all other users\' data.',
      });
    }
  }

  /* 6. Weak password hashing — high (not critical): md5/sha1 also serve
   * legitimate non-password uses (Gravatar, ETags, cache keys, content
   * addressing), so the finding demands verification, not blind panic. */
  const weakHashFindings = await searchInFiles(
    WEAK_HASH_PATTERNS,
    sourceFiles,
    'high',
    'lgpd-password-hashing',
    'MD5/SHA1 detected — cryptographically broken for passwords and unsuitable for new designs. If this hashes passwords or signs tokens, replace it with bcrypt (cost ≥ 12) or Argon2id (LGPD Art. 46). Gravatar/ETag/cache uses are acceptable but should be documented.',
    { stripComments: true }
  );
  findings.push(...weakHashFindings);

  const plainPwdFindings = await searchInFiles(
    PLAINTEXT_PASSWORD_PATTERNS,
    sourceFiles,
    'critical',
    'lgpd-password-hashing',
    'Never store passwords in plain text. Always hash with bcrypt (cost ≥ 12) or Argon2id before persisting to the database.',
    { stripComments: true }
  );
  // Deduplicate — avoid adding if already caught by weak hash scan in same file
  for (const f of plainPwdFindings) {
    if (!findings.some((ex) => ex.file === f.file && ex.category === f.category)) {
      findings.push(f);
    }
  }

  /* 6b. INSERT ... password ... VALUES — the hashing guard is evaluated over
   * the whole matched statement (both single-line and multi-line template
   * literals). Both $1 and ? placeholders are accepted. */
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    INSERT_PASSWORD_RE.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = INSERT_PASSWORD_RE.exec(content)) !== null) {
      // Guard window: the matched statement plus the rest of its line (where
      // `bcrypt.hash(...)` lands when passed in the parameter array after
      // VALUES) and the line preceding the statement start (the common
      // `const hash = …;` + multi-line template literal pattern).
      const statementLineStart = content.lastIndexOf('\n', im.index - 1) + 1;
      const prevLineStart =
        statementLineStart > 0 ? content.lastIndexOf('\n', statementLineStart - 2) + 1 : 0;
      let lineEnd = content.indexOf('\n', im.index + im[0].length);
      if (lineEnd === -1) lineEnd = content.length;
      const guardWindow = content.slice(prevLineStart, lineEnd);
      if (HASHING_GUARD_RE.test(guardWindow)) continue; // bcrypt.hash(...) etc.
      findings.push({
        severity: 'critical',
        category: 'lgpd-password-hashing',
        message: 'Possible plaintext password inserted into database',
        file: file.replace(projectRoot() + '/', ''),
        fix: 'Never store passwords in plain text. Always hash with bcrypt (cost ≥ 12) or Argon2id before persisting to the database.',
      });
      break; // one finding per file
    }
  }

  /* Score calculation */
  const maxScore = 20;
  const deductions = findings.reduce((acc, f) => {
    if (f.severity === 'critical') return acc + 8;
    if (f.severity === 'high') return acc + 5;
    if (f.severity === 'medium') return acc + 3;
    if (f.severity === 'low') return acc + 1;
    return acc; // info findings are advisory — no deduction
  }, 0);

  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
