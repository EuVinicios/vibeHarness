import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS } from './security.js';

export async function scanInfra(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const srcFiles = await fg('**/*.{js,ts}', {
    cwd: projectRoot(),
    ignore: EXCLUDED_DIRS.map((d) => `**/${d}/**`),
    absolute: true,
    suppressErrors: true,
  });

  let hasHealthEndpoint = false;
  let hasRateLimiting = false;
  let hasErrorHandler = false;

  for (const file of srcFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (/['"`]\/health(z)?['"`]/i.test(content)) hasHealthEndpoint = true;
    if (/rate.?limi/i.test(content)) hasRateLimiting = true;
    if (/error.?handler|onError|errorMiddleware/i.test(content)) hasErrorHandler = true;
  }

  if (!hasHealthEndpoint) {
    findings.push({
      severity: 'medium',
      category: 'infra',
      message: 'No /health or /healthz endpoint detected',
      fix: 'Add `app.get("/healthz", (req, res) => res.json({ status: "ok" }))`. Required by Kubernetes, Railway, Fly.io and load balancers to route traffic correctly.',
    });
  }
  if (!hasRateLimiting) {
    findings.push({
      severity: 'medium',
      category: 'infra',
      message: 'No rate-limiting middleware detected — auth and payment routes are unprotected',
      fix: 'Install `npm i @upstash/ratelimit` or `express-rate-limit` and apply to `/api/auth/*` and `/api/payment/*`. Without this, your app is vulnerable to brute-force and DDoS.',
    });
  }
  if (!hasErrorHandler) {
    findings.push({
      severity: 'medium',
      category: 'infra',
      message: 'No global error handler detected — stack traces may leak to end-users',
      fix: 'Add a global error handler: `app.use((err, req, res, next) => { log(err); res.status(500).json({ message: "Internal error" }); })`. Never send raw `err.stack` to clients.',
    });
  }

  const hasCI = existsSync(join(projectRoot(), '.github', 'workflows')) ||
    (await fg('.github/workflows/*.{yml,yaml}', {
      cwd: projectRoot(),
      dot: true,
      suppressErrors: true,
    })).length > 0;

  if (!hasCI) {
    findings.push({
      severity: 'medium',
      category: 'infra',
      message: 'No GitHub Actions workflow found — no automated quality gate on PRs',
      fix: 'Run `npx @vibeharness/cli init` which creates `.github/workflows/vibe-gate.yml` or add a workflow that runs `npx @vibeharness/cli audit --fail-under 70`.',
    });
  }

  const maxScore = 10;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'medium' ? 3 : 1),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
