import chalk from 'chalk';
import ora from 'ora';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { banner, projectRoot, writeFileSafe } from '../utils/fs.js';
import { dependabotTemplate } from '../generators/dependabot.js';
import { NODE_EOL, nodeEolStatus } from '../utils/node-eol.js';
import { checkSecurityTooling, commandExists } from '../utils/tooling.js';

const execAsync = promisify(exec);

interface DoctorOptions {
  fix?: boolean;
}

interface OutdatedEntry {
  current?: string;
  latest?: string;
  wanted?: string;
  type?: string;
}

/** Parse owner/repo from an origin remote URL (https or ssh). */
function parseOrigin(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.#?]+)(?:\.git)?/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Best-effort platform security posture via the GitHub CLI (gh).
 * Advisory only — never fails the doctor. Requires gh installed + a GitHub
 * origin remote; private checks need appropriate repo permissions.
 */
async function checkGithubPosture(): Promise<void> {
  console.log(chalk.bold('  GitHub platform security (via gh CLI):'));

  if (!(await commandExists('gh'))) {
    console.log(chalk.dim('    ·  gh CLI not found — install it for secret-scanning & branch-protection checks.'));
    console.log(chalk.dim('       https://cli.github.com/'));
    return;
  }

  let origin: { owner: string; repo: string } | null = null;
  try {
    const { stdout } = await execAsync('git remote get-url origin', { cwd: projectRoot() });
    origin = parseOrigin(stdout.trim());
  } catch { /* no git remote */ }
  if (!origin) {
    console.log(chalk.dim('    ·  No GitHub origin remote — platform checks skipped.'));
    return;
  }

  const slug = `${origin.owner}/${origin.repo}`;
  const api = `repos/${slug}`;

  // Secret scanning + push protection
  try {
    const { stdout } = await execAsync(`gh api ${api} --jq '{secret_scanning: .security_and_analysis.secret_scanning.status, push_protection: .security_and_analysis.secret_scanning_push_protection.status}'`, { cwd: projectRoot() });
    const analysis = JSON.parse(stdout) as { secret_scanning?: string; push_protection?: string };
    if (analysis.secret_scanning === 'enabled') {
      console.log(chalk.green(`    ✔  Secret scanning enabled (${slug}).`));
    } else {
      console.log(chalk.yellow(`    ⚠  Secret scanning NOT enabled (${slug}) — enable it in Settings → Code security.`));
    }
    if (analysis.push_protection === 'enabled') {
      console.log(chalk.green('    ✔  Secret scanning push protection enabled.'));
    } else {
      console.log(chalk.yellow('    ⚠  Push protection for secrets off — blocks new secrets at commit time.'));
    }
  } catch {
    console.log(chalk.dim(`    ·  Could not read security settings for ${slug} (needs repo admin visibility).`));
  }

  // Branch protection on default branch
  try {
    const { stdout: repoInfo } = await execAsync(`gh api ${api} --jq .default_branch`, { cwd: projectRoot() });
    const branch = repoInfo.trim() || 'main';
    const { stdout: branchInfo } = await execAsync(
      `gh api ${api}/branches/${branch} --jq .protected`,
      { cwd: projectRoot() }
    );
    if (branchInfo.trim() === 'true') {
      console.log(chalk.green(`    ✔  Branch protection enabled on '${branch}'.`));
    } else {
      console.log(chalk.yellow(`    ⚠  Branch '${branch}' is NOT protected — require PRs + status checks before merge.`));
    }
  } catch {
    console.log(chalk.dim('    ·  Could not read branch protection (needs read access / admin for private repos).'));
  }
}

async function getOutdated(): Promise<Record<string, OutdatedEntry>> {
  try {
    const { stdout } = await execAsync('npm outdated --json', { cwd: projectRoot() });
    return JSON.parse(stdout || '{}') as Record<string, OutdatedEntry>;
  } catch (err: unknown) {
    // npm outdated exits with code 1 when outdated packages exist
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) {
      try {
        return JSON.parse(stdout) as Record<string, OutdatedEntry>;
      } catch {
        return {};
      }
    }
    return {};
  }
}

function majorBehind(current?: string, latest?: string): boolean {
  if (!current || !latest) return false;
  const a = parseInt(current.replace(/^\D*/, ''), 10);
  const b = parseInt(latest.replace(/^\D*/, ''), 10);
  return !Number.isNaN(a) && !Number.isNaN(b) && b > a;
}

export async function doctorCommand(opts: DoctorOptions): Promise<void> {
  banner('VibeHarness · DOCTOR');

  let issues = 0;

  // 1. Node.js runtime freshness
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const status = nodeEolStatus(nodeMajor);
  if (status === 'eol') {
    issues++;
    console.log(chalk.red(`  ✖  Node.js ${nodeMajor} is EOL (since ${NODE_EOL[nodeMajor]}). Upgrade to the latest LTS.`));
  } else if (status === 'active') {
    console.log(chalk.green(`  ✔  Node.js ${nodeMajor} is within its support window.`));
  } else {
    console.log(chalk.yellow(`  ⚠  Node.js ${nodeMajor} — unknown support status, check https://nodejs.org/en/about/previous-releases`));
  }

  // 2. Lockfile presence
  const root = projectRoot();
  if (existsSync(join(root, 'package.json'))) {
    const hasLockfile =
      existsSync(join(root, 'package-lock.json')) ||
      existsSync(join(root, 'pnpm-lock.yaml')) ||
      existsSync(join(root, 'yarn.lock'));
    if (!hasLockfile) {
      issues++;
      console.log(chalk.red('  ✖  No lockfile found — builds are not reproducible. Run `npm install` and commit the lockfile.'));
    } else {
      console.log(chalk.green('  ✔  Lockfile present (reproducible builds).'));
    }
  }

  // 3. Outdated dependencies
  if (existsSync(join(root, 'package.json'))) {
    const spinner = ora('Checking outdated dependencies…').start();
    const outdated = await getOutdated();
    const names = Object.keys(outdated);
    if (names.length === 0) {
      spinner.succeed('All dependencies are up to date.');
    } else {
      const majors = names.filter((n) => majorBehind(outdated[n].current, outdated[n].latest));
      spinner.warn(`${names.length} outdated dependencies (${majors.length} major bumps).`);
      issues += majors.length;
      for (const name of names.slice(0, 15)) {
        const { current, latest } = outdated[name];
        const marker = majorBehind(current, latest) ? chalk.red('major') : chalk.yellow('minor/patch');
        console.log(`     ${marker}  ${name}: ${current ?? '?'} → ${latest ?? '?'}`);
      }
      if (names.length > 15) console.log(chalk.dim(`     … and ${names.length - 15} more (run \`npm outdated\`).`));
      console.log(chalk.dim('     Tip: upgrade majors one at a time, with tests. Dependabot/Renovate can automate this.'));
    }
  }

  // 4. Dependabot
  const dependabotPath = join(root, '.github', 'dependabot.yml');
  if (existsSync(dependabotPath)) {
    console.log(chalk.green('  ✔  Dependabot configured (.github/dependabot.yml).'));
  } else if (opts.fix) {
    await writeFileSafe(dependabotPath, dependabotTemplate());
    console.log(chalk.green('  ✔  Dependabot config generated (.github/dependabot.yml).'));
  } else {
    issues++;
    console.log(chalk.yellow('  ⚠  No Dependabot config. Run `npx @vibeharness/cli doctor --fix` to generate one.'));
  }

  // 5. GitHub platform posture (advisory — gh CLI, best-effort)
  console.log('');
  await checkGithubPosture();

  // 6. Security tooling (advisory — not counted as an issue)
  const tooling = await checkSecurityTooling();
  console.log('');
  console.log(chalk.bold('  Security tooling (recommended):'));
  for (const { tool, installed } of tooling) {
    if (installed) {
      console.log(chalk.green(`    ✔  ${tool.name} installed — ${tool.purpose}`));
    } else {
      console.log(chalk.dim(`    ·  ${tool.name} not found — ${tool.purpose}`));
      console.log(chalk.dim(`       install: ${tool.install}`));
    }
  }

  console.log('');
  if (issues === 0) {
    console.log(chalk.bold.green('✅  Doctor found no maintenance issues.'));
  } else {
    console.log(chalk.bold.yellow(`🩺  Doctor found ${issues} maintenance issue(s) — see above.`));
  }
  console.log('');
}
