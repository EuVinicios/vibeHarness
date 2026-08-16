import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../utils/fs.js';

/**
 * Capabilities the project already solved with its own stack (v0.8 — born
 * from dogfooding: recommending Better Auth/Stripe/Coolify on top of
 * Supabase Auth/Asaas/Vercel is noise, not help).
 */
export interface ResolvedCapabilities {
  auth: string | null;
  payments: string | null;
  deploy: string | null;
  testing: string | null;
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function readPackageJson(root: string): PackageJsonShape | null {
  try {
    if (!existsSync(join(root, 'package.json'))) return null;
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJsonShape;
  } catch {
    return null;
  }
}

function installedDeps(root: string): Set<string> {
  const deps = new Set<string>();
  const pkg = readPackageJson(root);
  if (!pkg) return deps;
  for (const name of Object.keys(pkg.dependencies ?? {})) deps.add(name);
  for (const name of Object.keys(pkg.devDependencies ?? {})) deps.add(name);
  return deps;
}

const AUTH_DEPS: [string, string][] = [
  ['@supabase/supabase-js', 'Supabase Auth'],
  ['next-auth', 'Auth.js (next-auth)'],
  ['@auth/core', 'Auth.js'],
  ['better-auth', 'Better Auth'],
  ['@clerk/clerk-react', 'Clerk'],
  ['@clerk/nextjs', 'Clerk'],
  ['firebase-admin', 'Firebase Auth'],
  ['firebase', 'Firebase Auth'],
];

const PAYMENT_DEPS: [string, string][] = [
  ['stripe', 'Stripe'],
  ['pagarme', 'Pagar.me'],
  ['@pagarme/js-sdk', 'Pagar.me'],
  ['mercadopago', 'Mercado Pago'],
  ['asaas-sdk', 'Asaas'],
  ['@paypal/paypal-js', 'PayPal'],
  ['efí', 'Efí (Gerencianet)'],
];

const DEPLOY_MARKERS: [string, string][] = [
  ['vercel.json', 'Vercel'],
  ['netlify.toml', 'Netlify'],
  ['fly.toml', 'Fly.io'],
  ['railway.json', 'Railway'],
  ['railway.toml', 'Railway'],
  ['render.yaml', 'Render'],
  ['wrangler.toml', 'Cloudflare Workers'],
  ['wrangler.jsonc', 'Cloudflare Workers'],
];

/** Unit-test runners (v0.8.3 — dogfooding: recommending Vitest next to an
 * already-configured Jest is a Law 6 violation, not help). E2E-only
 * frameworks are deliberately absent: a project with Playwright but no unit
 * runner still needs the unit layer Law 5 requires. */
const TEST_RUNNER_DEPS: [string, string][] = [
  ['jest', 'Jest'],
  ['@jest/core', 'Jest'],
  ['vitest', 'Vitest'],
  ['mocha', 'Mocha'],
  ['ava', 'AVA'],
];

/** Node's built-in runner leaves no dependency trace — the `test` script is
 * the only evidence (`node --test`, possibly behind flags). */
const NODE_TEST_SCRIPT_RE = /\bnode\b[^&|;]*--test\b/;

/** Detect capabilities already solved by the project's current stack. */
export function detectResolvedCapabilities(root: string = projectRoot()): ResolvedCapabilities {
  const deps = installedDeps(root);

  let auth: string | null = null;
  for (const [dep, name] of AUTH_DEPS) {
    if (deps.has(dep)) {
      auth = name;
      break;
    }
  }

  let payments: string | null = null;
  for (const [dep, name] of PAYMENT_DEPS) {
    if (deps.has(dep)) {
      payments = name;
      break;
    }
  }

  let deploy: string | null = null;
  for (const [marker, name] of DEPLOY_MARKERS) {
    if (existsSync(join(root, marker))) {
      deploy = `${name} (${marker})`;
      break;
    }
  }

  let testing: string | null = null;
  for (const [dep, name] of TEST_RUNNER_DEPS) {
    if (deps.has(dep)) {
      testing = name;
      break;
    }
  }
  if (!testing) {
    const testScript = readPackageJson(root)?.scripts?.test ?? '';
    if (NODE_TEST_SCRIPT_RE.test(testScript)) testing = 'node:test';
  }

  return { auth, payments, deploy, testing };
}
