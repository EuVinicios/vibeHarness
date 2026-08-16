import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog, type Catalog, type CatalogEntry } from '../src/registry/index.js';
import {
  buildApplyPlan,
  executeApplyPlan,
  readInstalledDeps,
  renderApplyPlan,
  appendApplyTrail,
  isAllowedRecipePath,
  type ApplyResult,
} from '../src/core/apply.js';
import { APPLY_RECIPES } from '../src/core/recipes.js';

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'vh-apply-'));
}

const baseEntry: CatalogEntry = {
  repo: 'x/y',
  name: 'Y',
  stars: 100,
  license: 'MIT',
  lastPush: '2026-08-01',
  lastVerified: '2026-08-01',
  tags: [],
};

describe('recipe path invariant (never touch src/)', () => {
  it('allows root configs and .vibe/** only', () => {
    expect(isAllowedRecipePath('vitest.config.ts')).toBe(true);
    expect(isAllowedRecipePath('.mcp.json')).toBe(true);
    expect(isAllowedRecipePath('.vibe/starters/x.ts')).toBe(true);
    expect(isAllowedRecipePath('src/index.ts')).toBe(false);
    expect(isAllowedRecipePath('app/routes/x.ts')).toBe(false);
    expect(isAllowedRecipePath('../evil.ts')).toBe(false);
    expect(isAllowedRecipePath('.vibe/../src/x.ts')).toBe(false);
  });

  it('treats backslash separators like slashes (Windows parity)', () => {
    expect(isAllowedRecipePath('src\\index.ts')).toBe(false);
    expect(isAllowedRecipePath('.vibe\\starters\\x.ts')).toBe(true);
    expect(isAllowedRecipePath('.vibe\\..\\src\\x.ts')).toBe(false);
  });

  it('every shipped recipe file honours the invariant', () => {
    for (const [repo, recipe] of Object.entries(APPLY_RECIPES)) {
      for (const file of recipe.files ?? []) {
        expect({ repo, path: file.path, allowed: isAllowedRecipePath(file.path) }).toEqual({
          repo,
          path: file.path,
          allowed: true,
        });
      }
    }
  });
});

describe('buildApplyPlan', () => {
  it('plans all applicable categories from the real catalog', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'fullstack-web',
      hasAuth: true,
      hasPayments: true,
      installedDeps: new Set(),
    });
    const categories = plan.items.map((i) => i.category);
    expect(categories).toEqual(expect.arrayContaining(['validation', 'database', 'auth', 'payments', 'testing', 'security', 'mcp']));
    expect(plan.items.find((i) => i.category === 'validation')?.entry.repo).toBe('colinhacks/zod');
    expect(plan.items.find((i) => i.category === 'payments')?.entry.repo).toBe('stripe/stripe-node');
  });

  it('omits auth and payments when the threat model excludes them', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'landing',
      hasAuth: false,
      hasPayments: false,
      installedDeps: new Set(),
    });
    const categories = plan.items.map((i) => i.category);
    expect(categories).not.toContain('auth');
    expect(categories).not.toContain('payments');
  });

  it('plans the linting PAIR — ESLint (linter) plus Prettier (formatter) (v0.8.3)', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'fullstack-web',
      hasAuth: true,
      hasPayments: false,
      installedDeps: new Set(),
    });
    const linting = plan.items.filter((i) => i.category === 'linting');
    // Star-order alone would ship Prettier only — the linter must be there too.
    expect(linting.map((i) => i.entry.repo)).toEqual(['eslint/eslint', 'prettier/prettier']);
    expect(APPLY_RECIPES['eslint/eslint'].files?.some((f) => f.path === 'eslint.config.mjs')).toBe(true);
    expect(APPLY_RECIPES['prettier/prettier'].files?.some((f) => f.path === '.prettierrc.json')).toBe(true);
  });

  it('skips categories whose packages are already installed', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'fullstack-web',
      hasAuth: true,
      hasPayments: false,
      installedDeps: new Set(['zod']),
    });
    const skipped = plan.skipped.find((s) => s.category === 'validation');
    expect(skipped?.reason).toBe('already installed');
    expect(plan.items.map((i) => i.category)).not.toContain('validation');
  });

  it('degrades to a recommendation when the primary entry has no recipe', () => {
    const catalog: Catalog = {
      version: 1,
      lastSync: '2026-08-14',
      criteria: { minStars: 0, maxPushAgeDays: 90, allowedLicenses: ['MIT'] },
      categories: {
        validation: [{ ...baseEntry, repo: 'unknown/tool', name: 'Unknown', stars: 999 }],
      },
    };
    const plan = buildApplyPlan(catalog, {
      projectType: 'api',
      hasAuth: false,
      hasPayments: false,
      installedDeps: new Set(),
    });
    expect(plan.items).toEqual([]);
    expect(plan.skipped.some((s) => s.category === 'validation' && s.reason.includes('no apply recipe'))).toBe(true);
  });

  it('renderApplyPlan produces one line per planned and skipped item', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'fullstack-web',
      hasAuth: true,
      hasPayments: true,
      installedDeps: new Set(['zod']),
    });
    const lines = renderApplyPlan(plan);
    expect(lines.length).toBe(plan.items.length + plan.skipped.length);
  });
});

describe('readInstalledDeps', () => {
  it('reads dependencies and devDependencies', () => {
    const root = makeTmp();
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ dependencies: { zod: '^3.0.0' }, devDependencies: { vitest: '^2.0.0' } })
      );
      const deps = readInstalledDeps(root);
      expect(deps.has('zod')).toBe(true);
      expect(deps.has('vitest')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns an empty set when package.json is missing or invalid', () => {
    const root = makeTmp();
    try {
      expect(readInstalledDeps(root).size).toBe(0);
      writeFileSync(join(root, 'package.json'), '{invalid');
      expect(readInstalledDeps(root).size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('executeApplyPlan', () => {
  it('writes configs/starters and .env.example without a package.json, and never creates src/', async () => {
    const root = makeTmp();
    try {
      const catalog = await loadCatalog();
      const plan = buildApplyPlan(catalog!, {
        projectType: 'fullstack-web',
        hasAuth: true,
        hasPayments: true,
        installedDeps: new Set(),
      });
      const result: ApplyResult = await executeApplyPlan(plan, { root, yes: true, projectName: 'demo' });

      // Starters and configs written
      expect(result.filesWritten).toEqual(expect.arrayContaining(['.vibe/starters/validation/schema-example.ts']));
      expect(existsSync(join(root, '.vibe/starters/validation/schema-example.ts'))).toBe(true);
      expect(existsSync(join(root, '.mcp.json'))).toBe(true);
      expect(existsSync(join(root, '.github/workflows/security.yml'))).toBe(true);

      // Env example aggregated from all recipes
      expect(result.envVarsAdded).toEqual(expect.arrayContaining(['SUPABASE_URL', 'STRIPE_SECRET_KEY']));
      const env = readFileSync(join(root, '.env.example'), 'utf8');
      expect(env).toContain('SUPABASE_URL=');
      expect(env).toContain('STRIPE_SECRET_KEY=');

      // Installs are skipped without package.json (no network in tests)
      expect(result.installedPackages).toEqual([]);

      // The core invariant: nothing inside src/
      expect(existsSync(join(root, 'src'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('appendApplyTrail records what was applied in STACK.md', async () => {
    const root = makeTmp();
    try {
      const stackPath = join(root, 'STACK.md');
      mkdirSync(root, { recursive: true });
      writeFileSync(stackPath, '# Stack\n');
      await appendApplyTrail(stackPath, {
        installedPackages: ['zod'],
        failedInstalls: [],
        filesWritten: ['.vibe/starters/validation/schema-example.ts'],
        envVarsAdded: ['DATABASE_URL'],
        binariesInstalled: [],
        skippedBinaries: ['gitleaks'],
      });
      const content = readFileSync(stackPath, 'utf8');
      expect(content).toContain('## Applied by VibeHarness');
      expect(content).toContain('zod');
      expect(content).toContain('DATABASE_URL');
      expect(content).toContain('gitleaks');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('detectResolvedCapabilities (v0.8)', () => {
  it('detects auth/payments from deps and deploy from config files', async () => {
    const { detectResolvedCapabilities } = await import('../src/core/apply.js');
    const root = makeTmp();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        dependencies: { '@supabase/supabase-js': '^2.0.0', stripe: '^14.0.0' },
        devDependencies: { jest: '^30.0.0' },
      }),
      'utf8'
    );
    writeFileSync(join(root, 'vercel.json'), '{}', 'utf8');
    const resolved = detectResolvedCapabilities(root);
    expect(resolved.auth).toBe('Supabase Auth');
    expect(resolved.payments).toBe('Stripe');
    expect(resolved.deploy).toContain('Vercel');
    expect(resolved.testing).toBe('Jest');
  });

  it('detects node:test from the test script when no runner dep exists', async () => {
    const { detectResolvedCapabilities } = await import('../src/core/apply.js');
    const root = makeTmp();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'node --test tests/' } }),
      'utf8'
    );
    const resolved = detectResolvedCapabilities(root);
    expect(resolved.testing).toBe('node:test');
  });

  it('buildApplyPlan skips categories already resolved by the existing stack', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'saas',
      hasAuth: true,
      hasPayments: true,
      installedDeps: new Set<string>(),
      resolved: { auth: 'Supabase Auth', payments: null, deploy: 'Vercel (vercel.json)', testing: 'Jest' },
    });
    const reasons = plan.skipped.map((s) => `${s.category}:${s.reason}`);
    expect(reasons).toContain('auth:already resolved by Supabase Auth');
    expect(reasons).toContain('deploy:already resolved by Vercel (vercel.json)');
    expect(reasons).toContain('testing:already resolved by Jest');
    expect(plan.items.map((i) => i.category)).not.toContain('auth');
    expect(plan.items.map((i) => i.category)).not.toContain('deploy');
    expect(plan.items.map((i) => i.category)).not.toContain('testing');
  });
});

describe('apply v0.8.2 — testing defaults & trail cap', () => {
  it('plans Vitest (unit) FIRST and Playwright (E2E) as complementary for testing', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'fullstack-web',
      hasAuth: false,
      hasPayments: false,
      installedDeps: new Set<string>(),
    });
    const testing = plan.items.filter((i) => i.category === 'testing');
    expect(testing.map((t) => t.entry.repo)).toEqual(['vitest-dev/vitest', 'microsoft/playwright']);
  });

  it('skips the E2E layer when @playwright/test is already installed', async () => {
    const catalog = await loadCatalog();
    const plan = buildApplyPlan(catalog!, {
      projectType: 'fullstack-web',
      hasAuth: false,
      hasPayments: false,
      installedDeps: new Set(['@playwright/test']),
    });
    const testing = plan.items.filter((i) => i.category === 'testing');
    expect(testing.map((t) => t.entry.repo)).toEqual(['vitest-dev/vitest']);
    expect(plan.skipped.some((s) => s.category === 'testing' && s.reason === 'already installed')).toBe(true);
  });

  it('caps the STACK.md audit trail at 5 entries', async () => {
    const root = makeTmp();
    try {
      const stackPath = join(root, 'STACK.md');
      writeFileSync(stackPath, '# Stack\n');
      const result: ApplyResult = {
        installedPackages: ['zod'],
        failedInstalls: [],
        filesWritten: [],
        envVarsAdded: [],
        binariesInstalled: [],
        skippedBinaries: [],
        auditWarnings: [],
      };
      for (let i = 0; i < 7; i++) await appendApplyTrail(stackPath, result);
      const content = readFileSync(stackPath, 'utf8');
      const entries = content.split('## Applied by VibeHarness').length - 1;
      expect(entries).toBe(5);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
