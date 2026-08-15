import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import chalk from 'chalk';
import { box } from '../ui/box.js';

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function writeFileSafe(
  filePath: string,
  content: string,
  overwrite = false
): Promise<boolean> {
  await ensureDir(dirname(filePath));
  if (!overwrite && existsSync(filePath)) {
    console.log(chalk.yellow(`  ⚠  Skipped (already exists): ${filePath}`));
    return false;
  }
  await writeFile(filePath, content, 'utf8');
  console.log(chalk.green(`  ✔  Written: ${filePath}`));
  return true;
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
