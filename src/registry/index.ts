import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface CatalogCriteria {
  minStars: number;
  maxPushAgeDays: number;
  allowedLicenses: string[];
}

export interface CatalogEntry {
  repo: string;
  name: string;
  stars: number;
  license: string;
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

export function isLicenseAllowed(catalog: Catalog, entry: CatalogEntry): boolean {
  return catalog.criteria.allowedLicenses.includes(entry.license);
}

export function topEntries(catalog: Catalog, category: string, n = 3): CatalogEntry[] {
  const entries = catalog.categories[category] ?? [];
  return [...entries].sort((a, b) => b.stars - a.stars).slice(0, n);
}

export function categoriesOf(catalog: Catalog): string[] {
  return Object.keys(catalog.categories);
}
