import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { projectRoot } from '../utils/fs.js';

/**
 * Cached audit score for the cockpit header — running the full audit on
 * every render is too costly, so the Conductor persists the latest result
 * in `.vibe/.audit-cache.json` (considered stale after 24h).
 */

export interface ScoreCache {
  score: number;
  max: number;
  grade: string;
  timestamp: string;
}

const STALE_MS = 24 * 60 * 60 * 1000;

function cachePath(root: string = projectRoot()): string {
  return join(root, '.vibe', '.audit-cache.json');
}

export async function readScoreCache(root?: string): Promise<ScoreCache | null> {
  try {
    const raw = await readFile(cachePath(root), 'utf8');
    const parsed = JSON.parse(raw) as ScoreCache;
    if (
      typeof parsed.score !== 'number' ||
      typeof parsed.max !== 'number' ||
      typeof parsed.grade !== 'string' ||
      typeof parsed.timestamp !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isStale(cache: ScoreCache, now: number = Date.now()): boolean {
  const ts = Date.parse(cache.timestamp);
  if (Number.isNaN(ts)) return true;
  return now - ts > STALE_MS;
}

/** Fresh cache for display, or null when missing/stale. */
export async function readFreshScoreCache(root?: string): Promise<ScoreCache | null> {
  const cache = await readScoreCache(root);
  if (!cache || isStale(cache)) return null;
  return cache;
}

export async function writeScoreCache(
  score: number,
  max: number,
  grade: string,
  root?: string
): Promise<void> {
  const path = cachePath(root);
  const cache: ScoreCache = {
    score,
    max,
    grade,
    timestamp: new Date().toISOString(),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}
