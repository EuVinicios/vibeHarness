import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';

const execAsync = promisify(exec);

export const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk_live_[0-9a-zA-Z]{24,}\b/, 'Stripe live secret key'],
  [/\bpk_live_[0-9a-zA-Z]{24,}\b/, 'Stripe live publishable key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS Access Key ID'],
  [/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}/, 'GitHub token'],
  [/\bsk-ant-[0-9A-Za-z_-]{20,}/, 'Anthropic API key'],
  [/\bsk-proj-[0-9A-Za-z_-]{20,}/, 'OpenAI project API key'],
  [/\bsk-[0-9A-Za-z]{40,}\b/, 'OpenAI API key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/xox[abprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
  [/glpat-[0-9A-Za-z_-]{20,}/, 'GitLab personal access token'],
  [/SG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}/, 'SendGrid API key'],
  [/\bSK[0-9a-f]{32}\b/, 'Twilio API key'],
  [/-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/, 'Private key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'Hardcoded JWT'],
  [/password\s*=\s*["'][^"']{4,}["']/i, 'Hardcoded password'],
  [/api[_-]?key\s*[:=]\s*["'][^"']{8,}["']/i, 'Hardcoded API key'],
  [/secret\s*[:=]\s*["'][^"']{8,}["']/i, 'Hardcoded secret'],
  [/mongodb(\+srv)?:\/\/[^@\s]+:[^@\s]+@/, 'MongoDB URI with credentials'],
  [/postgresql:\/\/[^@\s]+:[^@\s]+@/, 'PostgreSQL URI with credentials'],
];

export const EXCLUDED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv', 'coverage',
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

export async function scanSecrets(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const files = await fg('**/*.{js,ts,jsx,tsx,py,env,json,yaml,yml,toml,sh,bash}', {
    cwd: projectRoot(),
    ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...(await loadAuditIgnores())],
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
    const isCode = /\.(js|ts|jsx|tsx|py)$/i.test(file);
    if (isCode) codeFiles.push(file);

    // Secret patterns — collect several per file (dedup by label, capped).
    const seenLabels = new Set<string>();
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (seenLabels.size >= MAX_FINDINGS_PER_FILE) break;
      if (pattern.test(content)) {
        if (seenLabels.has(label)) continue;
        seenLabels.add(label);
        findings.push({
          severity: 'critical',
          category: 'secrets',
          message: `Potential ${label} detected`,
          file: rel,
          fix: 'Move this value to an environment variable and add it to .gitignore. Never commit credentials.',
        });
      }
    }
  }

  const gitignoreContent = existsSync(join(projectRoot(), '.gitignore'))
    ? await readFile(join(projectRoot(), '.gitignore'), 'utf8')
    : '';
  if (!gitignoreContent.includes('.env')) {
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

    if (WILDCARD_CORS_PATTERN.test(content)) {
      const withCredentials = CREDENTIALS_TRUE_PATTERN.test(content);
      findings.push({
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
      findings.push({
        severity: 'medium',
        category: 'secrets',
        message: 'Cookies set without httpOnly/secure/sameSite flags detected',
        file: rel,
        fix: 'Set cookies with `httpOnly: true`, `secure: true` (HTTPS), and `sameSite: \'lax\'|\'strict\'` to prevent theft and CSRF.',
      });
    }

    if (JWT_SIGN_NONE_PATTERN.test(content)) {
      findings.push({
        severity: 'critical',
        category: 'secrets',
        message: 'JWT signed with "none" algorithm — tokens can be forged',
        file: rel,
        fix: 'Never allow `alg: none`. Pin the algorithm explicitly (e.g., HS256 with a strong secret or RS256) on both sign and verify.',
      });
    } else if (JWT_SECRET_LITERAL_PATTERN.test(content)) {
      findings.push({
        severity: 'high',
        category: 'secrets',
        message: 'JWT secret hardcoded in source',
        file: rel,
        fix: 'Load the JWT secret from an environment variable (`process.env.JWT_SECRET`) and rotate it. A committed secret lets anyone forge tokens.',
      });
    }

    if (JWT_DECODE_PATTERN.test(content) && !JWT_VERIFY_PATTERN.test(content)) {
      findings.push({
        severity: 'high',
        category: 'secrets',
        message: 'JWT decoded with jwt.decode() without signature verification (jwt.verify)',
        file: rel,
        fix: '`jwt.decode` does NOT verify the signature — anyone can forge the payload. Use `jwt.verify(token, secret)` for anything security-relevant.',
      });
    }

    if (EXPRESS_PATTERN.test(content) && !HELMET_PATTERN.test(content)) {
      findings.push({
        severity: 'medium',
        category: 'secrets',
        message: 'Express app without security-headers middleware (helmet)',
        file: rel,
        fix: 'Add `helmet()` early in the middleware chain to set CSP, HSTS, X-Frame-Options and other security headers.',
      });
    }

    if (SESSION_PATTERN.test(content) && !CSRF_MARKER_PATTERN.test(content)) {
      findings.push({
        severity: 'medium',
        category: 'secrets',
        message: 'Cookie/session-based auth without CSRF protection markers detected',
        file: rel,
        fix: 'Use SameSite cookies plus a CSRF token (or double-submit cookie) on all state-changing routes. Without it, third-party sites can forge authenticated requests.',
      });
    }
  }

  const maxScore = 30;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'critical' ? 20 : f.severity === 'high' ? 10 : 5),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}

export async function scanDependencies(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  if (!existsSync(join(projectRoot(), 'package.json'))) {
    return { score: 10, maxScore: 10, findings: [] };
  }

  try {
    await execAsync('npm audit --json', { cwd: projectRoot() });
  } catch (err: unknown) {
    const output = (err as { stdout?: string }).stdout ?? '';
    if (output) {
      try {
        const report = JSON.parse(output) as {
          metadata?: { vulnerabilities?: { high?: number; critical?: number; moderate?: number } };
        };
        const vuln = report.metadata?.vulnerabilities ?? {};
        if ((vuln.critical ?? 0) > 0) {
          findings.push({
            severity: 'critical',
            category: 'dependencies',
            message: `${vuln.critical} critical CVEs in npm dependencies`,
            fix: 'Run `npm audit fix` or upgrade the affected packages. Check https://security.snyk.io for details.',
          });
        }
        if ((vuln.high ?? 0) > 0) {
          findings.push({
            severity: 'high',
            category: 'dependencies',
            message: `${vuln.high} high-severity CVEs in npm dependencies`,
            fix: 'Run `npm audit fix` to resolve. Review packages with `npm audit` for details.',
          });
        }
        if ((vuln.moderate ?? 0) > 0) {
          findings.push({
            severity: 'medium',
            category: 'dependencies',
            message: `${vuln.moderate} moderate CVEs in npm dependencies`,
            fix: 'Run `npm audit` and evaluate upgrades for affected packages.',
          });
        }
      } catch { /* parse error — skip */ }
    }
  }

  const maxScore = 10;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'critical' ? 10 : f.severity === 'high' ? 5 : 2),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
