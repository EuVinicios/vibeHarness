import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from './fs.js';

/**
 * Loads user-defined audit exclusions from `.vibe/auditignore`
 * (gitignore-style glob patterns, one per line, `#` comments allowed).
 *
 * Purpose: suppress KNOWN false positives — e.g. test fixtures that contain
 * intentional fake secrets used to verify the scanners themselves. Mirrors
 * the allowlist mechanism of gitleaks and friends.
 *
 * v0.9 model: exclusions never silently delete findings' visibility —
 * entries should carry an inline reason (`path  # reason`), overly broad
 * patterns are flagged by the audit, and vendor-secret criticals in
 * NON-test files can no longer be suppressed at all.
 */
export async function loadAuditIgnores(): Promise<string[]> {
  const entries = await loadAuditIgnoreEntries();
  return entries.map((e) => e.pattern);
}

export interface AuditIgnoreEntry {
  pattern: string;
  /** Inline justification written as `path  # reason`. Absent = undocumented. */
  reason?: string;
}

export async function loadAuditIgnoreEntries(): Promise<AuditIgnoreEntry[]> {
  const path = join(projectRoot(), '.vibe', 'auditignore');
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const hashIdx = line.indexOf('#');
        if (hashIdx === -1) return { pattern: line };
        const pattern = line.slice(0, hashIdx).trim();
        const reason = line.slice(hashIdx + 1).trim();
        return pattern ? { pattern, reason: reason || undefined } : null;
      })
      .filter((e): e is AuditIgnoreEntry => e !== null);
  } catch {
    return [];
  }
}

/**
 * Patterns that switch the audit off for a whole tree (double-star catch-alls
 * such as `src/**`, or whole-extension wildcards). These are audit
 * kill-switches — the scanner flags them as high-severity blind spots
 * instead of honouring them silently.
 */
export function isOverlyBroadPattern(pattern: string): boolean {
  const p = pattern.trim();
  if (!p || p.startsWith('!')) return false; // negations narrow scope
  if (p === '*' || p === '**') return true;
  // `**/*`, `**/**`, `**/*.ts`, `**/*.{ts,tsx}` — every file of an extension anywhere
  if (/^\*{1,2}\/\*{1,2}(\.[a-z0-9*]+|\.\{[^}]+\})?$/i.test(p)) return true;
  // `src/**`, `app/*` — an entire top-level directory
  if (/^[a-z0-9_.-]+\/\*{1,2}$/i.test(p)) return true;
  return false;
}

/**
 * Resolves auditignore globs to the concrete set of files they suppress,
 * so scanners can (a) skip non-vendor findings with accounting and
 * (b) report how much of the project is excluded.
 */
export async function resolveAuditIgnoreFiles(patterns: string[]): Promise<Set<string>> {
  if (patterns.length === 0) return new Set();
  const root = projectRoot();
  const out = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) continue; // negations are not exclusions
    try {
      const matches = await fg(pattern, {
        cwd: root,
        dot: true,
        absolute: true,
        suppressErrors: true,
      });
      for (const m of matches) out.add(m);
    } catch {
      // A broken glob must never crash the audit — it just matches nothing.
    }
  }
  return out;
}
