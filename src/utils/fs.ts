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
 * explicit opt-in. Two safety properties:
 * - never writes through a symlink (a repo-planted link could point anywhere,
 *   e.g. `.mcp.json -> ~/.profile`);
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
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
  if (!quiet) console.log(chalk.green(`  ✔  Written: ${filePath}`));
  return true;
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
