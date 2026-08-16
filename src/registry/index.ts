import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * A license outside `allowedLicenses` is tolerated ONLY when the entry carries
 * a `licenseNote` documenting the exception (e.g. "AGPL — CLI-only usage").
 * This mirrors how the catalog curates AGPL/LGPL/proprietary tools: usable as
 * standalone CLIs/services, never vendored into user code.
 */
export function isLicenseAcceptable(catalog: Catalog, entry: CatalogEntry): boolean {
  if (isLicenseAllowed(catalog, entry)) return true;
  return typeof entry.licenseNote === 'string' && entry.licenseNote.trim().length > 0;
}

/** Catalog shape is validated on load: it is data shipped inside the package
 * and drives recommendations applied to user projects — a corrupted snapshot
 * must fail loud, not flow half-parsed into the plan. */
const CatalogEntrySchema = z.object({
  repo: z.string().min(1),
  name: z.string().min(1),
  stars: z.number().int().nonnegative(),
  license: z.string().min(1),
  licenseOverride: z.string().optional(),
  licenseNote: z.string().optional(),
  lastPush: z.string().min(1),
  lastVerified: z.string().min(1),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const CatalogSchema = z.object({
  version: z.number(),
  lastSync: z.string().min(1),
  criteria: z.object({
    minStars: z.number(),
    maxPushAgeDays: z.number(),
    allowedLicenses: z.array(z.string()),
  }),
  categories: z.record(z.string(), z.array(CatalogEntrySchema)),
});

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

const here = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = join(here, '..', '..', 'registry', 'catalog.json');

export async function loadCatalog(): Promise<Catalog | null> {
  try {
    const raw = await readFile(CATALOG_PATH, 'utf8');
    const parsed = CatalogSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isCatalogStale(catalog: Catalog, maxAgeDays = 30, now = new Date()): boolean {
  const synced = new Date(catalog.lastSync).getTime();
  if (Number.isNaN(synced)) return true;
  const ageDays = (now.getTime() - synced) / (1000 * 60 * 60 * 24);
  return ageDays > maxAgeDays;
}

/** The license that counts for curation — manual verification wins over the API value. */
export function effectiveLicense(entry: CatalogEntry): string {
  return entry.licenseOverride ?? entry.license;
}

export function isLicenseAllowed(catalog: Catalog, entry: CatalogEntry): boolean {
  return catalog.criteria.allowedLicenses.includes(effectiveLicense(entry));
}

/**
 * Validate every catalog entry against the catalog's own curation criteria.
 * Returns human-readable violation strings — empty array when all is well.
 * Used to fail loud (instead of fail open) when a license/activity/stars
 * change slips in through an automated registry sync.
 */
export function catalogViolations(catalog: Catalog, now = new Date()): string[] {
  const violations: string[] = [];
  const nowMs = now.getTime();
  for (const [category, entries] of Object.entries(catalog.categories)) {
    for (const entry of entries) {
      if (!isLicenseAcceptable(catalog, entry)) {
        violations.push(
          `${category}/${entry.repo}: license "${effectiveLicense(entry)}" not allowed and no licenseNote documenting an exception`
        );
      }
      if (entry.stars < catalog.criteria.minStars) {
        violations.push(`${category}/${entry.repo}: ${entry.stars} stars < minStars ${catalog.criteria.minStars}`);
      }
      const pushAgeDays = (nowMs - new Date(entry.lastPush).getTime()) / (1000 * 60 * 60 * 24);
      if (Number.isNaN(pushAgeDays) || pushAgeDays > catalog.criteria.maxPushAgeDays) {
        violations.push(`${category}/${entry.repo}: last push ${entry.lastPush} older than ${catalog.criteria.maxPushAgeDays} days`);
      }
    }
  }
  return violations;
}

export function topEntries(catalog: Catalog, category: string, n = 3): CatalogEntry[] {
  const entries = catalog.categories[category] ?? [];
  return [...entries].sort((a, b) => b.stars - a.stars).slice(0, n);
}
