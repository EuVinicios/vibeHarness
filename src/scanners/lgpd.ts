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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS } from './security.js';

/* ─── Patterns ─────────────────────────────────────────────────────────────── */

/** Detects PII being printed/logged without masking — literal PII values. */
const PII_LOG_PATTERNS: [RegExp, string][] = [
  // CPF patterns (###.###.###-##  or  11 digits)
  [
    /console\.(log|error|warn|info|debug)\s*\([^)]*\b(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})\b/,
    'CPF number in log statement',
  ],
  // E-mail in logs
  [
    /console\.(log|error|warn|info|debug)\s*\([^)]*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    'E-mail address in log statement',
  ],
  // Phone number in logs (BR format)
  [
    /console\.(log|error|warn|info|debug)\s*\([^)]*(\+55|0\d{2})?\s*\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/,
    'Phone number in log statement',
  ],
];

/**
 * Sensitive *field names* in log statements — triaged (v0.8): a keyword inside
 * a static message ('Error resetting password:') is not PII leakage; a keyword
 * interpolated with data or logged as a value is.
 */
const SENSITIVE_FIELD_LOG_RE =
  /console\.(log|error|warn|info|debug)\s*\(([^)\n]*)\b(password|senha|token|secret|cpf|rg)\b/gi;
const SENSITIVE_FIELD_PRINT_RE = /print\s*\(([^)\n]*)\b(password|senha|cpf|email|token|secret)\b/gi;

/**
 * Returns the quote character surrounding `index` in `src` ('"', "'", '`'),
 * or null when the position is outside any string literal.
 */
function quoteStateAt(src: string, index: number): string | null {
  let quote: string | null = null;
  for (let i = 0; i < index && i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (quote === null && (ch === '"' || ch === "'" || ch === '`')) quote = ch;
    else if (quote === ch) quote = null;
  }
  return quote;
}

/**
 * Classify a sensitive-keyword log match using the whole call line:
 * - keyword outside any quotes (logged as a value) → dynamic
 * - keyword inside a template literal that interpolates data → dynamic
 * - keyword inside a plain static string → static (no data logged)
 */
function triageSensitiveLog(callLine: string, kwIndex: number): 'dynamic' | 'static' {
  const quote = quoteStateAt(callLine, kwIndex);
  if (quote === null) return 'dynamic';
  if (quote === '`') return callLine.includes('${') ? 'dynamic' : 'static';
  return 'static';
}

/** Insecure password hashing */
const WEAK_HASH_PATTERNS: [RegExp, string][] = [
  [/md5\s*\(/i, 'MD5 hash used for password/data (cryptographically broken)'],
  [/sha1\s*\(/i, 'SHA1 hash used for password/data (weak for passwords)'],
  [/createHash\s*\(\s*['"]md5['"]/i, 'Node.js MD5 hash'],
  [/createHash\s*\(\s*['"]sha1['"]/i, 'Node.js SHA1 hash'],
  [/hashlib\.(md5|sha1)\s*\(/i, 'Python MD5/SHA1 hash'],
];

const CONSENT_MARKERS = [
  'cookie-consent',
  'cookieconsent',
  'cookie_consent',
  'consentimento',
  'lgpd',
  'gdpr',
  'gtag',
  'CookieYes',
  'OneTrust',
  'Cookiebot',
];

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
  /router\.(delete|del)\s*\(\s*['"`][^'"]*\/(user|account|me|usuario|conta)/i,
  /app\.(delete|del)\s*\(\s*['"`][^'"]*\/(user|account|me|usuario|conta)/i,
  /route\s*\(\s*['"`]delete['"`]\s*,\s*['"`][^'"]*\/(user|account|me|usuario|conta)/i,
  /@Delete\s*\(\s*['"`][^'"]*\/(user|account|me|usuario|conta)/i,
  /\.rpc\(\s*['"`](delete[_-]?(own[_-]?)?(account|user|conta|usuario)|(account|user|conta|usuario)[_-]?delete)['"`]/i,
  /create\s+(?:or\s+replace\s+)?function\s+(delete[_-]?(own[_-]?)?(account|user|conta|usuario)|(account|user|conta|usuario)[_-]?delete)\s*\(/i,
];

const DSR_EXPORT_PATTERNS = [
  /export.*\/(user|account|me|usuario)\/(data|dados|export|exportar)/i,
  /download.*\/(user|account|me|usuario)\/(data|dados)/i,
  /portabilidade/i,
  /'data.?export'|"data.?export"|`data.?export`/i,
  /\.rpc\(\s*['"`](export[_-]?(own[_-]?)?(user[_-]?)?data|user[_-]?data[_-]?export|exportar[_-]?dados)['"`]/i,
  /create\s+(?:or\s+replace\s+)?function\s+(export[_-]?(own[_-]?)?(user[_-]?)?data|user[_-]?data[_-]?export)\s*\(/i,
];

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
  [/INSERT.*password.*VALUES.*\$.*(?!hash|bcrypt|argon)/i, 'Possible plaintext password inserted into database'],
];

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
const API_SURFACE_PATTERN =
  /app\.(get|post|put|patch|delete|use)\s*\(\s*['"`/]|router\.(get|post|put|patch|delete)\s*\(\s*['"`/]|@(Controller|Get|Post|Put|Delete|Route)\b|fastify\.(get|post|put|delete)\s*\(|@(app|ctr)\.(Get|Post|Put|Delete)/;

/**
 * True when the project exposes a web surface (UI components or HTTP routes).
 * Pure CLIs/libraries skip the web-only LGPD checks (consent banner, privacy
 * pages, DSR endpoints) — they are web-application obligations (LGPD Art. 8/9/18
 * apply to data controllers operating user-facing services, not dev tooling).
 */
async function hasWebSurface(uiFiles: string[], sourceFiles: string[]): Promise<boolean> {
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
  fix: string
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
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
    'Use a logging library with field masking (e.g., pino redact) and never log CPF, e-mail, phone, password, or tokens. Instrument with `logger.info({ userId }, "msg")` instead of logging the full user object.'
  );
  findings.push(...piiFindings);

  /* 1b. Sensitive field NAMES in logs — triaged (v0.8).
   * 'Error resetting password:' (static message, no data) is not leakage;
   * interpolated values or logged identifiers are. Static matches are not
   * scored — one info finding summarises how many were triaged away. */
  let staticMessageMatches = 0;
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
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

  /* 2. Cookie consent */
  let hasConsent = false;
  for (const file of uiFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (CONSENT_MARKERS.some((m) => content.toLowerCase().includes(m.toLowerCase()))) {
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
      content = await readFile(file, 'utf8');
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

  /* 4. DSR endpoints (web apps only) — HTTP routes, Supabase RPCs and SQL
   * functions alike (v0.8: `delete_own_account()`/`export_user_data()` were
   * false negatives when only route syntax was recognised). */
  if (isWebApp) {
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
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (!hasDeletion && DSR_DELETE_PATTERNS.some((p) => p.test(content))) hasDeletion = true;
    if (!hasExport && DSR_EXPORT_PATTERNS.some((p) => p.test(content))) hasExport = true;
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
  const hasSupabase = existsSync(join(root, 'node_modules', '@supabase'));
  const hasPrisma = existsSync(join(root, 'prisma', 'schema.prisma'));
  if (hasSupabase || hasPrisma) {
    let hasRLS = false;
    for (const file of sqlFiles) {
      let content: string;
      try {
        content = await readFile(file, 'utf8');
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

  /* 6. Weak password hashing */
  const weakHashFindings = await searchInFiles(
    WEAK_HASH_PATTERNS,
    sourceFiles,
    'critical',
    'lgpd-password-hashing',
    'Replace MD5/SHA1 with bcrypt (cost ≥ 12) or Argon2id for password hashing. These algorithms are required by LGPD Art. 46 (appropriate security measures). Example: `import bcrypt from "bcrypt"; bcrypt.hash(password, 12)`'
  );
  findings.push(...weakHashFindings);

  const plainPwdFindings = await searchInFiles(
    PLAINTEXT_PASSWORD_PATTERNS,
    sourceFiles,
    'critical',
    'lgpd-password-hashing',
    'Never store passwords in plain text. Always hash with bcrypt (cost ≥ 12) or Argon2id before persisting to the database.'
  );
  // Deduplicate — avoid adding if already caught by weak hash scan in same file
  for (const f of plainPwdFindings) {
    if (!findings.some((ex) => ex.file === f.file && ex.category === f.category)) {
      findings.push(f);
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
