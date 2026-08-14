import {
  loadCatalog,
  isCatalogStale,
  isLicenseAllowed,
  topEntries,
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
