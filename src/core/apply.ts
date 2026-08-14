import chalk from 'chalk';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, appendFile } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { Catalog, CatalogEntry } from '../registry/index.js';
import { topEntries } from '../registry/index.js';
import { APPLY_RECIPES, type ApplyRecipe } from './recipes.js';
import { detectPackageManager, type PackageManager } from './stage.js';
import { writeFileSafe, readFileSafe, projectRoot } from '../utils/fs.js';
import { securityWorkflowTemplate } from '../generators/security-workflow.js';

const execFileAsync = promisify(execFile);

export interface ApplyContext {
  projectType: string;
  hasAuth: boolean;
  hasPayments: boolean;
  /** Names already present in package.json dependencies + devDependencies. */
  installedDeps: Set<string>;
}

export interface PlannedItem {
  category: string;
  entry: CatalogEntry;
  recipe: ApplyRecipe;
}

export interface SkippedItem {
  category: string;
  entry?: CatalogEntry;
  reason: string;
}

export interface ApplyPlan {
  items: PlannedItem[];
  skipped: SkippedItem[];
}

export interface ApplyResult {
  installedPackages: string[];
  failedInstalls: { command: string; error: string }[];
  filesWritten: string[];
  envVarsAdded: string[];
  binariesInstalled: string[];
  skippedBinaries: string[];
}

/** Categories VibeHarness can physically apply. Frontend/backend frameworks stay recommendation-only in v1. */
const APPLICABLE_CATEGORIES = [
  'validation',
  'database',
  'auth',
  'payments',
  'testing',
  'security',
  'mcp',
  'deploy',
] as const;

/** Reads package.json dependencies + devDependencies into a Set (empty on any error). */
export function readInstalledDeps(root: string = projectRoot()): Set<string> {
  const deps = new Set<string>();
  try {
    if (!existsSync(join(root, 'package.json'))) return deps;
    const raw = readFileSync(join(root, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const name of Object.keys(pkg.dependencies ?? {})) deps.add(name);
    for (const name of Object.keys(pkg.devDependencies ?? {})) deps.add(name);
  } catch {
    /* unparseable package.json — treat as empty */
  }
  return deps;
}

/**
 * Recipe files must be root-level configs or live under .vibe/ — the apply
 * flow NEVER writes inside the user's src/. This guard makes that invariant
 * structural instead of relying on recipe authors.
 */
export function isAllowedRecipePath(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.startsWith('.vibe/')) return true;
  return !path.includes('/');
}

export function buildApplyPlan(catalog: Catalog, ctx: ApplyContext): ApplyPlan {
  const items: PlannedItem[] = [];
  const skipped: SkippedItem[] = [];

  for (const category of APPLICABLE_CATEGORIES) {
    if (category === 'auth' && !ctx.hasAuth) continue;
    if (category === 'payments' && !ctx.hasPayments) continue;

    const primary = topEntries(catalog, category, 1)[0];
    if (!primary) continue;

    const recipe = APPLY_RECIPES[primary.repo];
    if (!recipe) {
      skipped.push({ category, entry: primary, reason: 'no apply recipe yet — recommendation only' });
      continue;
    }

    const packages = [...(recipe.install ?? []), ...(recipe.devInstall ?? [])];
    if (packages.length > 0 && packages.every((p) => ctx.installedDeps.has(p))) {
      skipped.push({ category, entry: primary, reason: 'already installed' });
      continue;
    }

    items.push({ category, entry: primary, recipe });
  }

  return { items, skipped };
}

export function renderApplyPlan(plan: ApplyPlan): string[] {
  const lines: string[] = [];
  for (const item of plan.items) {
    const parts: string[] = [];
    if (item.recipe.install?.length) parts.push(`install ${item.recipe.install.join(', ')}`);
    if (item.recipe.devInstall?.length) parts.push(`dev-install ${item.recipe.devInstall.join(', ')}`);
    if (item.recipe.files?.length) parts.push(`write ${item.recipe.files.map((f) => f.path).join(', ')}`);
    if (item.recipe.envVars?.length) parts.push(`env: ${item.recipe.envVars.map((e) => e.name).join(', ')}`);
    if (item.recipe.binary) parts.push(`system tool: ${item.recipe.binary.name} (needs consent)`);
    lines.push(`  ${item.category.padEnd(11)} ${item.entry.name} — ${parts.join(' · ') || 'guidance only'}`);
  }
  for (const s of plan.skipped) {
    lines.push(chalk.dim(`  ${s.category.padEnd(11)} ${s.entry?.name ?? ''} — skipped (${s.reason})`));
  }
  return lines;
}

function installArgs(pm: PackageManager, packages: string[], dev: boolean): string[] {
  switch (pm) {
    case 'yarn':
      return ['add', ...(dev ? ['-D'] : []), ...packages];
    case 'pnpm':
      return ['add', ...(dev ? ['-D'] : []), ...packages];
    case 'bun':
      return ['add', ...(dev ? ['-d'] : []), ...packages];
    default:
      return ['install', ...(dev ? ['-D'] : []), ...packages];
  }
}

async function ensureEnvExample(root: string, recipe: ApplyRecipe, added: string[]): Promise<void> {
  if (!recipe.envVars?.length) return;
  const envPath = join(root, '.env.example');
  let existing = (await readFileSafe(envPath)) ?? '';
  let changed = false;
  for (const v of recipe.envVars) {
    const re = new RegExp(`^${v.name}=`, 'm');
    if (!re.test(existing)) {
      existing += `${existing.length && !existing.endsWith('\n') ? '\n' : ''}# ${v.hint}\n${v.name}=\n`;
      added.push(v.name);
      changed = true;
    }
  }
  if (changed) {
    await writeFile(envPath, existing, 'utf8');
    console.log(chalk.green('  ✔  Updated .env.example'));
  }
}

async function installPackages(
  root: string,
  pm: PackageManager,
  prod: string[],
  dev: string[],
  result: ApplyResult
): Promise<void> {
  const runs: { args: string[]; pkgs: string[] }[] = [];
  if (prod.length) runs.push({ args: installArgs(pm, prod, false), pkgs: prod });
  if (dev.length) runs.push({ args: installArgs(pm, dev, true), pkgs: dev });

  for (const run of runs) {
    const command = `${pm} ${run.args.join(' ')}`;
    console.log(chalk.dim(`  $ ${command}`));
    try {
      await execFileAsync(pm, run.args, { cwd: root, maxBuffer: 10 * 1024 * 1024 });
      result.installedPackages.push(...run.pkgs);
      console.log(chalk.green(`  ✔  Installed: ${run.pkgs.join(', ')}`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.failedInstalls.push({ command, error: msg });
      console.log(chalk.red(`  ✖  Install failed (${pm}): ${msg.split('\n')[0]}`));
    }
  }
}

export interface ExecuteOptions {
  yes?: boolean;
  root?: string;
  projectName?: string;
}

export async function executeApplyPlan(plan: ApplyPlan, opts: ExecuteOptions): Promise<ApplyResult> {
  const root = opts.root ?? projectRoot();
  const result: ApplyResult = {
    installedPackages: [],
    failedInstalls: [],
    filesWritten: [],
    envVarsAdded: [],
    binariesInstalled: [],
    skippedBinaries: [],
  };

  const hasPackageJson = existsSync(join(root, 'package.json'));
  const pm = detectPackageManager(root);

  // 1. Files (configs + starters) — never inside src/ (guarded by isAllowedRecipePath)
  for (const item of plan.items) {
    for (const file of item.recipe.files ?? []) {
      if (!isAllowedRecipePath(file.path)) {
        console.log(chalk.red(`  ✖  Recipe path outside allowed scope skipped: ${file.path}`));
        continue;
      }
      const written = await writeFileSafe(join(root, file.path), file.content);
      if (written) result.filesWritten.push(file.path);
    }
    await ensureEnvExample(root, item.recipe, result.envVarsAdded);
  }

  // 2. Security CI gate — applied whenever the security category is in play
  if (plan.items.some((i) => i.category === 'security') || plan.skipped.some((s) => s.category === 'security')) {
    const workflowPath = join(root, '.github', 'workflows', 'security.yml');
    if (!existsSync(workflowPath)) {
      await writeFileSafe(workflowPath, securityWorkflowTemplate(opts.projectName ?? 'project'));
      result.filesWritten.push('.github/workflows/security.yml');
    }
  }

  // 3. Package installs (aggregated across recipes)
  const prod = [...new Set(plan.items.flatMap((i) => i.recipe.install ?? []))];
  const dev = [...new Set(plan.items.flatMap((i) => i.recipe.devInstall ?? []))];
  if (prod.length || dev.length) {
    if (!hasPackageJson) {
      console.log(
        chalk.yellow('  ⚠  No package.json found — dependency installs skipped (configs/starters were written).')
      )
      ;
    } else {
      await installPackages(root, pm, prod, dev, result);
    }
  }

  // 4. Binary tools (gitleaks, osv-scanner) — system-level, explicit consent only
  const binaries = plan.items.filter((i) => i.recipe.binary);
  if (binaries.length > 0) {
    const missing = binaries.filter((b) => !commandExistsSync(b.recipe.binary!.name));
    if (missing.length === 0) {
      for (const b of binaries) console.log(chalk.green(`  ✔  ${b.recipe.binary!.name} already installed`));
    } else if (opts.yes) {
      for (const b of missing) {
        result.skippedBinaries.push(b.recipe.binary!.name);
        console.log(chalk.dim(`  ↷  ${b.recipe.binary!.name} install skipped (non-interactive mode).`));
      }
    } else {
      const { prompt } = await import('enquirer');
      let go: boolean;
      try {
        const answer = await prompt<{ go: boolean }>({
          type: 'confirm',
          name: 'go',
          message: `Install system security tools via Homebrew (${missing.map((m) => m.recipe.binary!.name).join(', ')})?`,
          initial: true,
        } as Parameters<typeof prompt>[0]);
        go = answer.go;
      } catch {
        go = false;
      }
      if (go && commandExistsSync('brew')) {
        for (const b of missing) {
          const formula = b.recipe.binary!.brew ?? b.recipe.binary!.name;
          try {
            console.log(chalk.dim(`  $ brew install ${formula}`));
            await execFileAsync('brew', ['install', formula], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
            result.binariesInstalled.push(b.recipe.binary!.name);
            console.log(chalk.green(`  ✔  Installed ${b.recipe.binary!.name}`));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ✖  brew install ${formula} failed: ${msg.split('\n')[0]}`));
            result.skippedBinaries.push(b.recipe.binary!.name);
          }
        }
      } else {
        for (const b of missing) result.skippedBinaries.push(b.recipe.binary!.name);
        if (go && !commandExistsSync('brew')) {
          console.log(chalk.yellow('  ⚠  Homebrew not found — install manually (fallback patterns are already active).'));
        }
      }
    }
  }

  return result;
}

/** Small sync wrapper so the apply flow stays free of await-chains in hot paths. */
function commandExistsSync(cmd: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Append an "## Applied" audit trail to the generated STACK.md. */
export async function appendApplyTrail(stackPath: string, result: ApplyResult): Promise<void> {
  const lines: string[] = ['', '---', '', '## Applied by VibeHarness', ''];
  const date = new Date().toISOString().split('T')[0];
  lines.push(`_${date} — \`plan --apply\` audit trail._`, '');
  if (result.installedPackages.length) lines.push(`- **Installed:** ${result.installedPackages.join(', ')}`);
  if (result.filesWritten.length) lines.push(`- **Files created:** ${result.filesWritten.join(', ')}`);
  if (result.envVarsAdded.length) lines.push(`- **Env vars added (.env.example):** ${result.envVarsAdded.join(', ')}`);
  if (result.binariesInstalled.length) lines.push(`- **System tools installed:** ${result.binariesInstalled.join(', ')}`);
  if (result.skippedBinaries.length) lines.push(`- **System tools skipped:** ${result.skippedBinaries.join(', ')} (install manually for full secret/CVE coverage)`);
  if (result.failedInstalls.length) {
    lines.push(`- **Failed installs:** ${result.failedInstalls.map((f) => f.command).join('; ')} — re-run manually.`);
  }
  lines.push('');
  await appendFile(stackPath, lines.join('\n'), 'utf8');
}
