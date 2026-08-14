import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './fs.js';

/**
 * Loads user-defined audit exclusions from `.vibe/auditignore`
 * (gitignore-style glob patterns, one per line, `#` comments allowed).
 *
 * Purpose: suppress KNOWN false positives — e.g. test fixtures that contain
 * intentional fake secrets used to verify the scanners themselves. Mirrors
 * the allowlist mechanism of gitleaks and friends.
 */
export async function loadAuditIgnores(): Promise<string[]> {
  const path = join(projectRoot(), '.vibe', 'auditignore');
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  } catch {
    return [];
  }
}
