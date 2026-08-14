import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import type { Finding, AuditSectionResult } from '../core/types.js';

const execAsync = promisify(exec);

export const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk_live_[0-9a-zA-Z]{24,}\b/, 'Stripe live secret key'],
  [/\bpk_live_[0-9a-zA-Z]{24,}\b/, 'Stripe live publishable key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS Access Key ID'],
  [/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}/, 'GitHub token'],
  [/-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/, 'Private key'],
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

export async function scanSecrets(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const files = await fg('**/*.{js,ts,jsx,tsx,py,env,json,yaml,yml,toml,sh,bash}', {
    cwd: projectRoot(),
    ignore: EXCLUDED_DIRS.map((d) => `**/${d}/**`),
    dot: true,
    absolute: true,
    suppressErrors: true,
  });

  const filesToCheck = files.filter(
    (f) => !f.endsWith('.env.example') && !f.endsWith('.env.sample')
  );

  for (const file of filesToCheck) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        findings.push({
          severity: 'critical',
          category: 'secrets',
          message: `Potential ${label} detected`,
          file: file.replace(projectRoot() + '/', ''),
          fix: 'Move this value to an environment variable and add it to .gitignore. Never commit credentials.',
        });
        break;
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
