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
  /** Per-section scores (v0.8+) — lets status/vibe_status show the breakdown. */
  sections?: Record<string, { score: number; max: number }>;
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
    // The cache lives inside the cloned repo (untrusted input). Validate the
    // sections payload field-by-field before it reaches MCP/status output.
    if (parsed.sections !== undefined) {
      if (typeof parsed.sections !== 'object' || parsed.sections === null || Array.isArray(parsed.sections)) {
        return null;
      }
      for (const section of Object.values(parsed.sections)) {
        if (typeof section !== 'object' || section === null) return null;
        if (typeof section.score !== 'number' || typeof section.max !== 'number') return null;
      }
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
  root?: string,
  sections?: Record<string, { score: number; max: number }>
): Promise<void> {
  const path = cachePath(root);
  const cache: ScoreCache = {
    score,
    max,
    grade,
    timestamp: new Date().toISOString(),
    ...(sections ? { sections } : {}),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}
