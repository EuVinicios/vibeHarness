import {
  loadCatalog,
  isCatalogStale,
  isLicenseAllowed,
  isLicenseAcceptable,
  topEntries,
  catalogViolations,
  type Catalog,
  type CatalogEntry,
} from '../src/registry/index.js';
import { stackPlanTemplate } from '../src/generators/stack-plan.js';

const baseEntry: CatalogEntry = {
  repo: 'x/y',
  name: 'Y',
  stars: 100,
  license: 'MIT',
  lastPush: '2026-08-01',
  lastVerified: '2026-08-01',
  tags: [],
};

describe('registry catalog', () => {
  it('loads the catalog with the expected categories', async () => {
    const catalog = await loadCatalog();
    expect(catalog).not.toBeNull();
    expect(Object.keys(catalog!.categories)).toEqual(
      expect.arrayContaining(['frontend', 'backend', 'database', 'auth', 'mcp', 'ai-tools', 'security'])
    );
  });

  it('every entry has the required fields', async () => {
    const catalog = await loadCatalog();
    for (const entries of Object.values(catalog!.categories)) {
      for (const entry of entries) {
        expect(entry.repo).toMatch(/^[^/\s]+\/[^/\s]+$/);
        expect(entry.stars).toBeGreaterThan(0);
        expect(entry.license).toBeTruthy();
      }
    }
  });

  it('sorts top entries by stars descending', async () => {
    const catalog = await loadCatalog();
    const top = topEntries(catalog!, 'frontend', 3);
    expect(top.length).toBeGreaterThan(1);
    expect(top[0].stars).toBeGreaterThanOrEqual(top[1].stars);
  });

  it('flags catalogs older than the max age as stale', () => {
    const old: Catalog = {
      version: 1,
      lastSync: '2020-01-01',
      criteria: { minStars: 0, maxPushAgeDays: 90, allowedLicenses: ['MIT'] },
      categories: {},
    };
    expect(isCatalogStale(old)).toBe(true);
    expect(isCatalogStale({ ...old, lastSync: new Date().toISOString().split('T')[0] })).toBe(false);
  });

  it('rejects licenses outside the allow-list', async () => {
    const catalog = await loadCatalog();
    expect(isLicenseAllowed(catalog!, { ...baseEntry, license: 'AGPL-3.0' })).toBe(false);
    expect(isLicenseAllowed(catalog!, { ...baseEntry, license: 'MIT' })).toBe(true);
  });

  it('licenseOverride (verified manually) wins over the API value', async () => {
    const catalog = await loadCatalog();
    // API reports NOASSERTION for Astro — the override marks it as verified MIT.
    const astro = catalog!.categories.frontend.find((e) => e.repo === 'withastro/astro');
    expect(astro?.licenseOverride).toBe('MIT');
    expect(isLicenseAllowed(catalog!, astro!)).toBe(true);
    // An override naming a disallowed license must still fail.
    expect(
      isLicenseAllowed(catalog!, { ...baseEntry, license: 'NOASSERTION', licenseOverride: 'AGPL-3.0' })
    ).toBe(false);
  });

  it('out-of-allowlist licenses are tolerated only with a documented licenseNote', async () => {
    const catalog = await loadCatalog();
    const agplBare = { ...baseEntry, license: 'AGPL-3.0' };
    const agplNoted = { ...baseEntry, license: 'AGPL-3.0', licenseNote: 'AGPL — CLI-only usage.' };
    expect(isLicenseAllowed(catalog!, agplNoted)).toBe(false); // not in allowlist…
    expect(isLicenseAcceptable(catalog!, agplNoted)).toBe(true); // …but documented
    expect(isLicenseAcceptable(catalog!, agplBare)).toBe(false); // undocumented = violation
  });

  it('catalogViolations reports only real violations (documented exceptions pass)', async () => {
    const catalog = await loadCatalog();
    const violations = catalogViolations(catalog!);
    // Known expected advisory noise, documented in the entries' notes:
    // - react-testing-library: stable-main branch (>90d push)
    // - agent-os: content-complete methodology repo (slow cadence)
    const unexpected = violations.filter(
      (v) => !v.includes('react-testing-library') && !v.includes('agent-os')
    );
    expect(unexpected).toEqual([]);
  });

  it('dokploy is not recommended (production use requires a commercial license)', async () => {
    const catalog = await loadCatalog();
    const all = Object.values(catalog!.categories).flat();
    expect(all.some((e) => e.repo === 'dokploy/dokploy')).toBe(false);
    expect(all.some((e) => e.repo === 'basecamp/kamal')).toBe(true);
  });
});

describe('stackPlanTemplate', () => {
  it('renders primary recommendations, payments section and guardrails', async () => {
    const catalog = await loadCatalog();
    const md = stackPlanTemplate({
      projectName: 'demo',
      projectType: 'fullstack-web',
      catalog: catalog!,
      catalogStale: false,
      threatModel: { hasPayments: true, hasAuth: true, hasSensitiveData: false },
      detectedStack: ['Next.js'],
    });
    expect(md).toContain('Stack Recommendation — demo');
    expect(md).toContain('primary');
    expect(md).toContain('Payments');
    expect(md).toContain('Authentication');
    expect(md).toContain('Guardrails');
  });

  it('renders the curated Linting & Formatting section (v0.8.3)', async () => {
    const catalog = await loadCatalog();
    const md = stackPlanTemplate({
      projectName: 'demo',
      projectType: 'fullstack-web',
      catalog: catalog!,
      catalogStale: false,
      threatModel: null,
      detectedStack: [],
    });
    expect(md).toContain('Linting & Formatting');
    expect(md).toContain('ESLint');
    expect(md).toContain('Prettier');
  });

  it('omits auth/payments sections when the threat model excludes them', async () => {
    const catalog = await loadCatalog();
    const md = stackPlanTemplate({
      projectName: 'landing-demo',
      projectType: 'landing',
      catalog: catalog!,
      catalogStale: false,
      threatModel: { hasPayments: false, hasAuth: false, hasSensitiveData: false },
      detectedStack: [],
    });
    expect(md).not.toContain('### Payments');
    expect(md).not.toContain('### Authentication');
  });

  it('warns when the registry is stale', async () => {
    const catalog = await loadCatalog();
    const md = stackPlanTemplate({
      projectName: 'stale-demo',
      projectType: 'api',
      catalog: catalog!,
      catalogStale: true,
      threatModel: null,
      detectedStack: [],
    });
    expect(md).toContain('stale');
  });
});
