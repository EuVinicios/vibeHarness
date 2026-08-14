import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface CatalogCriteria {
  minStars: number;
  maxPushAgeDays: number;
  allowedLicenses: string[];
}

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

export interface CatalogEntry {
  repo: string;
  name: string;
  stars: number;
  license: string;
  /**
   * Maintainer-verified license for repos where the GitHub API reports
   * NOASSERTION (e.g. monorepos with vendored license files). When present,
   * this value wins over `license` for all curation checks and the sync
   * never overwrites it from the API.
   */
  licenseOverride?: string;
  lastPush: string;
  lastVerified: string;
  tags: string[];
  notes?: string;
  licenseNote?: string;
}

export interface Catalog {
  version: number;
  lastSync: string;
  criteria: CatalogCriteria;
  categories: Record<string, CatalogEntry[]>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const CATALOG_PATH = join(here, '..', '..', 'registry', 'catalog.json');

export async function loadCatalog(): Promise<Catalog | null> {
  try {
    const raw = await readFile(CATALOG_PATH, 'utf8');
    return JSON.parse(raw) as Catalog;
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
