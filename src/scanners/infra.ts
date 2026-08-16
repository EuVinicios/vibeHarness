import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS, isTestFile } from './security.js';
import { hasWebSurface, stripLineComments, API_SURFACE_PATTERN, SERVER_EVIDENCE_PATTERN } from './lgpd.js';

/**
 * Health route — accepts `/health`, `/healthz`, `/healthcheck` and prefixed
 * or sub-routed forms (`/api/health`, `/api/v1/health`, `/health/live`,
 * `/health/ready`), quoted with ', " or `.
 */
const HEALTH_ROUTE_RE = /['"`](?:\/[\w.-]+)*\/health(?:z|check)?(?:\/(?:live|ready|deep))?['"`]/i;

/**
 * Backend framework markers — `onError` only counts as a global error handler
 * in files that actually run a server (avoids matching React/JSX props such
 * as `<img onError={...}>` or error-boundary callbacks). Shared with
 * `hasWebSurface` so both gates agree on what "runs a server" means.
 */
const BACKEND_MARKER_RE = SERVER_EVIDENCE_PATTERN;

/** SSR/meta frameworks: their presence means routes may exist even without
 * explicit markers in the scanned files — never classify them as static. */
const SSR_FRAMEWORK_DEPS = ['next', 'nuxt', '@sveltejs/kit', 'astro', 'remix', '@remix-run/node'];

/**
 * True when the web surface comes exclusively from static markup — no route
 * handlers, no server markers in source, no SSR framework dependency. Static
 * sites/exports cannot host a /health endpoint or rate limiting, so the
 * web-server checks must not score them (pre-0.8.3 they scored 0/10).
 */
async function isStaticOnlySite(uiFiles: string[], srcFiles: string[]): Promise<boolean> {
  if (uiFiles.length === 0) return false;
  for (const file of srcFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (API_SURFACE_PATTERN.test(content) || BACKEND_MARKER_RE.test(content)) return false;
  }
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (SSR_FRAMEWORK_DEPS.some((d) => deps[d])) return false;
  } catch {
    /* no package.json — judge by code alone */
  }
  return true;
}

export async function scanInfra(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const auditIgnores = await loadAuditIgnores();
  const ignore = [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...auditIgnores];

  const srcFiles = await fg('**/*.{js,ts}', {
    cwd: projectRoot(),
    ignore,
    absolute: true,
    suppressErrors: true,
  });
  const uiFiles = await fg('**/*.{jsx,tsx,html,svelte,vue}', {
    cwd: projectRoot(),
    ignore,
    absolute: true,
    suppressErrors: true,
  });

  const maxScore = 10;

  // Web-surface gating: health endpoints, rate limiting and error handlers are
  // web-server obligations. Pure CLIs/libraries get a full score — mirrors the
  // lgpd-scope pattern so CLI projects are never penalised by web-only checks.
  if (!(await hasWebSurface(uiFiles, srcFiles))) {
    findings.push({
      severity: 'info',
      category: 'infra-scope',
      message: 'No web surface detected (no UI components or HTTP routes) — web-only infra checks skipped',
      fix: 'Not applicable to CLI/library projects. If this project grows a web UI or API, the health-endpoint, rate-limiting and error-handler checks activate automatically.',
    });
    return { score: maxScore, maxScore, findings };
  }

  // Static-site carve-out: a landing page or `next export` build has no
  // server to host health checks, rate limiting or error handlers on.
  if (await isStaticOnlySite(uiFiles, srcFiles)) {
    findings.push({
      severity: 'info',
      category: 'infra-scope',
      message: 'Static site detected (markup only, no server code) — web-server infra checks skipped',
      fix: 'Not applicable to static sites/exports. Health endpoints, rate limiting and error handlers become relevant if the project gains a server layer.',
    });
    return { score: maxScore, maxScore, findings };
  }

  let hasHealthEndpoint = false;
  let hasRateLimiting = false;
  let hasErrorHandler = false;

  for (const file of srcFiles) {
    // Test fixtures routinely spin up mock servers — letting them satisfy the
    // heuristics would mask a real app that has none of the three.
    const rel = file.replace(projectRoot() + '/', '');
    if (isTestFile(rel)) continue;
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    // A TODO note is not an implementation — comments never satisfy heuristics.
    content = stripLineComments(content);
    if (HEALTH_ROUTE_RE.test(content)) hasHealthEndpoint = true;
    if (/rate.?limi/i.test(content)) hasRateLimiting = true;
    if (/error.?handler|errorMiddleware/i.test(content) && BACKEND_MARKER_RE.test(content)) {
      hasErrorHandler = true;
    } else if (/onError/i.test(content) && BACKEND_MARKER_RE.test(content)) {
      hasErrorHandler = true;
    }
  }

  // Next.js App Router (and friends): filesystem routes have no quoted path
  // string in code — `app/api/health/route.ts` IS the health endpoint.
  if (!hasHealthEndpoint) {
    const fsHealthRoutes = await fg('**/{app,pages,src}/**/health*/route.{ts,js,tsx,jsx}', {
      cwd: projectRoot(),
      ignore,
      suppressErrors: true,
    });
    if (fsHealthRoutes.length > 0) hasHealthEndpoint = true;
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
      fix: 'Install `express-rate-limit` (Express), `@fastify/rate-limit` (Fastify) or `@upstash/ratelimit` (serverless) and apply it to `/api/auth/*` and `/api/payment/*`. Without this, your app is vulnerable to brute-force and DDoS.',
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

  // An EMPTY .github/workflows directory is not CI — require an actual file.
  const workflowFiles = await fg('.github/workflows/*.{yml,yaml}', {
    cwd: projectRoot(),
    ignore: auditIgnores,
    dot: true,
    suppressErrors: true,
  });
  const hasCI = workflowFiles.length > 0;

  if (!hasCI) {
    findings.push({
      severity: 'medium',
      category: 'infra',
      message: 'No GitHub Actions workflow found — no automated quality gate on PRs',
      fix: 'Run `npx @vibeharness/cli init` which creates `.github/workflows/vibe-gate.yml` or add a workflow that runs `npx @vibeharness/cli audit --fail-under 70`.',
    });
  }

  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'medium' ? 3 : 1),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
