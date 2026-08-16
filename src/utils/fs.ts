import { readFile, writeFile, mkdir, lstat, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import { box } from '../ui/box.js';

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export interface WriteOptions {
  /** Overwrite existing files (default: skip — the unified write policy). */
  overwrite?: boolean;
  /** Suppress the per-file console output (headless actions collect paths instead). */
  quiet?: boolean;
}

/**
 * Unified write policy: skip-if-exists by default, overwrite only with an
 * explicit opt-in. Three safety properties:
 * - never writes through a symlink (a repo-planted link could point anywhere,
 *   e.g. `.mcp.json -> ~/.profile`);
 * - the temp file is created with O_EXCL (`wx`): a pre-planted
 *   `<target>.tmp-<pid>` symlink is refused instead of being followed
 *   (predictable tmp names made this a TOCTOU vector);
 * - atomic: content goes to a sibling temp file first, then rename — a crash
 *   mid-write can never leave a config truncated.
 */
export async function writeFileSafe(
  filePath: string,
  content: string,
  options: boolean | WriteOptions = false
): Promise<boolean> {
  const { overwrite = false, quiet = false } = typeof options === 'boolean' ? { overwrite: options } : options;
  await ensureDir(dirname(filePath));

  let existing;
  try {
    existing = await lstat(filePath);
  } catch {
    existing = null;
  }
  if (existing) {
    if (existing.isSymbolicLink()) {
      if (!quiet) console.log(chalk.red(`  ✖  Refused to write through symlink: ${filePath}`));
      return false;
    }
    if (!overwrite) {
      if (!quiet) console.log(chalk.yellow(`  ⚠  Skipped (already exists): ${filePath}`));
      return false;
    }
  }

  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    // A pre-existing tmp path is only reusable as a plain stale file from a
    // crashed run — a planted symlink must never be written through.
    const stale = await lstat(tmp);
    if (stale.isSymbolicLink()) {
      if (!quiet) console.log(chalk.red(`  ✖  Refused to reuse symlinked temp file: ${tmp}`));
      return false;
    }
    await writeFile(tmp, content, 'utf8');
  }
  await rename(tmp, filePath);
  if (!quiet) console.log(chalk.green(`  ✔  Written: ${filePath}`));
  return true;
}

/**
 * True when any DIRECTORY segment between `anchor` and the target file is a
 * symlink (e.g. `.cursor -> /somewhere` planted in a repo). writeFileSafe's
 * own lstat only covers the final path component; without this check a
 * symlinked ancestor directory redirects the whole write outside the anchor.
 * The final component is excluded — writeFileSafe handles it.
 */
export async function hasSymlinkedAncestorSegment(anchor: string, relativePath: string): Promise<boolean> {
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  // Only directory segments: everything before the final file name.
  for (let i = 1; i < segments.length; i++) {
    const prefix = join(anchor, ...segments.slice(0, i));
    try {
      const st = await lstat(prefix);
      if (st.isSymbolicLink()) return true;
    } catch {
      // Missing segment — ensureDir will create it fresh (never a symlink).
      return false;
    }
  }
  return false;
}

/** Copy a file before rewriting it — lets the user recover from a bad merge. */
export async function backupFile(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const backupPath = `${filePath}.vibe-bak`;
  await copyFile(filePath, backupPath);
  return backupPath;
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function banner(text: string): void {
  console.log('\n' + box([`🛡️  ${text}`], { color: chalk.cyan }) + '\n');
}

export function cwd(): string {
  return process.cwd();
}

export function projectRoot(): string {
  return cwd();
}

export async function getProjectName(): Promise<string> {
  const pkgPath = join(projectRoot(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name) return pkg.name;
    } catch {
      // fall through
    }
  }
  return 'my-project';
}

export async function detectStack(): Promise<string[]> {
  const pkgPath = join(projectRoot(), 'package.json');
  const tags: string[] = [];
  const raw = await readFileSafe(pkgPath);
  if (!raw) return tags;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return tags;
  }

  const deps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  };

  const checks: [string, string][] = [
    ['next', 'Next.js'],
    ['react', 'React'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['@supabase/supabase-js', 'Supabase'],
    ['prisma', 'Prisma'],
    ['drizzle-orm', 'Drizzle'],
    ['stripe', 'Stripe'],
    ['@auth/core', 'Auth.js'],
    ['next-auth', 'NextAuth'],
    ['zod', 'Zod'],
    ['vite', 'Vite'],
  ];

  for (const [dep, label] of checks) {
    if (deps[dep]) tags.push(label);
  }

  // Python detection
  if (
    existsSync(join(projectRoot(), 'pyproject.toml')) ||
    existsSync(join(projectRoot(), 'requirements.txt'))
  ) {
    tags.push('Python');
    if (existsSync(join(projectRoot(), 'main.py'))) tags.push('FastAPI');
  }

  return tags;
}
