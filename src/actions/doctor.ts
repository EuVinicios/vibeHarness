import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot, writeFileSafe } from '../utils/fs.js';
import { dependabotTemplate } from '../generators/dependabot.js';
import { NODE_EOL, nodeEolStatus } from '../utils/node-eol.js';
import { checkSecurityTooling, commandExists } from '../utils/tooling.js';
import type { ActionResult } from './types.js';

// execFile (never exec): arguments travel as an argv array, so values coming
// from git remotes or the GitHub API can never reach a shell interpreter.
const execFileAsync = promisify(execFile);

/** Strict charset for anything interpolated into a GitHub API path. */
const SAFE_API_SEGMENT = /^[A-Za-z0-9._/-]+$/;

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

export interface DoctorCheck {
  id: string;
  group: 'runtime' | 'deps' | 'automation' | 'platform' | 'tooling';
  label: string;
  status: CheckStatus;
  detail?: string;
  hint?: string;
  /** Blocking issues count toward the final issue count. */
  blocking: boolean;
}

export interface DoctorActionOptions {
  fix?: boolean;
}

export interface DoctorActionData {
  checks: DoctorCheck[];
  issues: number;
  nodeVersion: string;
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
 * Parse an origin URL into a validated `owner/repo` slug. Remote URLs are
 * untrusted input (a cloned repo can set anything) — anything outside the
 * strict charset is rejected instead of being used to build API paths.
 */
export function trustedGithubSlug(originUrl: string): string | null {
  const parsed = parseOrigin(originUrl.trim());
  if (!parsed) return null;
  if (!SAFE_API_SEGMENT.test(parsed.owner) || !SAFE_API_SEGMENT.test(parsed.repo)) return null;
  return `${parsed.owner}/${parsed.repo}`;
}

function majorBehind(current?: string, latest?: string): boolean {
  if (!current || !latest) return false;
  const a = parseInt(current.replace(/^\D*/, ''), 10);
  const b = parseInt(latest.replace(/^\D*/, ''), 10);
  return !Number.isNaN(a) && !Number.isNaN(b) && b > a;
}

async function getOutdated(): Promise<{ outdated: Record<string, OutdatedEntry>; npmMissing: boolean }> {
  try {
    const { stdout } = await execFileAsync('npm', ['outdated', '--json'], {
      cwd: projectRoot(),
      maxBuffer: 10 * 1024 * 1024,
    });
    return { outdated: JSON.parse(stdout || '{}') as Record<string, OutdatedEntry>, npmMissing: false };
  } catch (err: unknown) {
    // ENOENT = npm is not installed — that is NOT "all up to date".
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { outdated: {}, npmMissing: true };
    }
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) {
      try {
        return { outdated: JSON.parse(stdout) as Record<string, OutdatedEntry>, npmMissing: false };
      } catch {
        return { outdated: {}, npmMissing: false };
      }
    }
    return { outdated: {}, npmMissing: false };
  }
}

/** Advisory platform security posture via the GitHub CLI (best-effort). */
async function checkGithubPosture(checks: DoctorCheck[]): Promise<void> {
  if (!(await commandExists('gh'))) {
    checks.push({
      id: 'gh-missing',
      group: 'platform',
      label: 'gh CLI',
      status: 'info',
      detail: 'not found — install it for secret-scanning & branch-protection checks (https://cli.github.com/)',
      blocking: false,
    });
    return;
  }

  let slug: string | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot(),
    });
    slug = trustedGithubSlug(stdout);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      checks.push({
        id: 'git-missing',
        group: 'platform',
        label: 'git',
        status: 'info',
        detail: 'git not found on PATH — install it to enable platform posture checks',
        blocking: false,
      });
      return;
    }
    /* no git remote */
  }
  if (!slug) {
    checks.push({
      id: 'gh-origin',
      group: 'platform',
      label: 'GitHub origin remote',
      status: 'info',
      detail: 'no parseable GitHub origin — platform checks skipped',
      blocking: false,
    });
    return;
  }

  const api = `repos/${slug}`;

  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'api',
        api,
        '--jq',
        '{secret_scanning: .security_and_analysis.secret_scanning.status, push_protection: .security_and_analysis.secret_scanning_push_protection.status}',
      ],
      { cwd: projectRoot() }
    );
    const analysis = JSON.parse(stdout) as { secret_scanning?: string; push_protection?: string };
    checks.push({
      id: 'gh-secret-scanning',
      group: 'platform',
      label: `Secret scanning (${slug})`,
      status: analysis.secret_scanning === 'enabled' ? 'ok' : 'warn',
      detail: analysis.secret_scanning === 'enabled' ? undefined : 'enable in Settings → Code security',
      blocking: false,
    });
    checks.push({
      id: 'gh-push-protection',
      group: 'platform',
      label: 'Push protection',
      status: analysis.push_protection === 'enabled' ? 'ok' : 'warn',
      detail: analysis.push_protection === 'enabled' ? undefined : 'blocks new secrets at commit time',
      blocking: false,
    });
  } catch {
    checks.push({
      id: 'gh-settings',
      group: 'platform',
      label: 'GitHub security settings',
      status: 'info',
      detail: `could not read settings for ${slug} (needs repo admin visibility)`,
      blocking: false,
    });
  }

  try {
    const { stdout: repoInfo } = await execFileAsync('gh', ['api', api, '--jq', '.default_branch'], {
      cwd: projectRoot(),
    });
    const branch = repoInfo.trim() || 'main';
    if (!SAFE_API_SEGMENT.test(branch)) {
      throw new Error(`untrusted default branch name: ${branch}`);
    }
    const { stdout: branchInfo } = await execFileAsync(
      'gh',
      ['api', `${api}/branches/${branch}`, '--jq', '.protected'],
      { cwd: projectRoot() }
    );
    const protectedBranch = branchInfo.trim() === 'true';
    checks.push({
      id: 'gh-branch-protection',
      group: 'platform',
      label: `Branch protection ('${branch}')`,
      status: protectedBranch ? 'ok' : 'warn',
      detail: protectedBranch ? undefined : 'require PRs + status checks before merge',
      blocking: false,
    });
  } catch {
    checks.push({
      id: 'gh-branch-protection',
      group: 'platform',
      label: 'Branch protection',
      status: 'info',
      detail: 'could not read (needs read access / admin for private repos)',
      blocking: false,
    });
  }
}

/** Headless doctor: structured maintenance checks (+dependabot fix). */
export async function doctorAction(opts: DoctorActionOptions = {}): Promise<ActionResult<DoctorActionData>> {
  const checks: DoctorCheck[] = [];
  const root = projectRoot();
  const outputs: string[] = [];

  // 1. Node.js runtime freshness
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const status = nodeEolStatus(nodeMajor);
  if (status === 'eol') {
    checks.push({
      id: 'node-eol',
      group: 'runtime',
      label: `Node.js ${nodeMajor}`,
      status: 'fail',
      detail: `EOL since ${NODE_EOL[nodeMajor]} — upgrade to the latest LTS`,
      blocking: true,
    });
  } else if (status === 'active') {
    checks.push({ id: 'node-eol', group: 'runtime', label: `Node.js ${nodeMajor}`, status: 'ok', detail: 'within its support window', blocking: false });
  } else {
    checks.push({ id: 'node-eol', group: 'runtime', label: `Node.js ${nodeMajor}`, status: 'warn', detail: 'unknown support status — check nodejs.org/en/about/previous-releases', blocking: false });
  }

  // 2. Lockfile presence
  if (existsSync(join(root, 'package.json'))) {
    const hasLockfile =
      existsSync(join(root, 'package-lock.json')) ||
      existsSync(join(root, 'pnpm-lock.yaml')) ||
      existsSync(join(root, 'yarn.lock'));
    checks.push(
      hasLockfile
        ? { id: 'lockfile', group: 'deps', label: 'Lockfile', status: 'ok', detail: 'reproducible builds', blocking: false }
        : {
            id: 'lockfile',
            group: 'deps',
            label: 'Lockfile',
            status: 'fail',
            detail: 'no lockfile — builds are not reproducible',
            hint: 'run `npm install` and commit the lockfile',
            blocking: true,
          }
    );
  }

  // 3. Outdated dependencies
  if (existsSync(join(root, 'package.json'))) {
    const { outdated, npmMissing } = await getOutdated();
    const names = Object.keys(outdated);
    if (npmMissing) {
      checks.push({
        id: 'outdated',
        group: 'deps',
        label: 'Dependencies',
        status: 'warn',
        detail: 'npm not found on PATH — install Node.js/npm so outdated dependencies can be checked',
        blocking: false,
      });
    } else if (names.length === 0) {
      checks.push({ id: 'outdated', group: 'deps', label: 'Dependencies', status: 'ok', detail: 'all up to date', blocking: false });
    } else {
      const majors = names.filter((n) => majorBehind(outdated[n].current, outdated[n].latest));
      checks.push({
        id: 'outdated:summary',
        group: 'deps',
        label: `${names.length} outdated (${majors.length} major bumps)`,
        status: majors.length > 0 ? 'warn' : 'ok',
        detail: 'run `npm outdated` for the full list',
        blocking: false,
      });
      for (const name of names.slice(0, 15)) {
        const { current, latest } = outdated[name];
        checks.push({
          id: `outdated:${name}`,
          group: 'deps',
          label: `${name}: ${current ?? '?'} → ${latest ?? '?'}`,
          status: majorBehind(current, latest) ? 'fail' : 'warn',
          detail: majorBehind(current, latest) ? 'major bump behind' : 'minor/patch behind',
          blocking: majorBehind(current, latest),
        });
      }
      if (names.length > 15) {
        checks.push({ id: 'outdated:more', group: 'deps', label: `…and ${names.length - 15} more`, status: 'info', detail: 'run `npm outdated`', blocking: false });
      }
      checks.push({
        id: 'outdated:tip',
        group: 'deps',
        label: 'Upgrade tip',
        status: 'info',
        detail: 'upgrade majors one at a time, with tests — Dependabot/Renovate can automate this',
        blocking: false,
      });
    }
  }

  // 4. Dependabot
  const dependabotPath = join(root, '.github', 'dependabot.yml');
  if (existsSync(dependabotPath)) {
    checks.push({ id: 'dependabot', group: 'automation', label: 'Dependabot', status: 'ok', detail: '.github/dependabot.yml configured', blocking: false });
  } else if (opts.fix) {
    await writeFileSafe(dependabotPath, dependabotTemplate(), { overwrite: true, quiet: true });
    outputs.push('.github/dependabot.yml');
    checks.push({ id: 'dependabot', group: 'automation', label: 'Dependabot', status: 'ok', detail: 'generated by --fix', blocking: false });
  } else {
    checks.push({
      id: 'dependabot',
      group: 'automation',
      label: 'Dependabot',
      status: 'warn',
      detail: 'no config',
      hint: 'run `doctor --fix` to generate one',
      blocking: true,
    });
  }

  // 5. GitHub platform posture (advisory)
  await checkGithubPosture(checks);

  // 6. Security tooling (advisory)
  const tooling = await checkSecurityTooling();
  for (const { tool, installed } of tooling) {
    checks.push({
      id: `tooling:${tool.name}`,
      group: 'tooling',
      label: `${tool.name}${installed ? '' : ' (not found)'}`,
      status: installed ? 'ok' : 'info',
      detail: installed ? tool.purpose : `${tool.purpose} — install: ${tool.install}`,
      blocking: false,
    });
  }

  const issues = checks.filter((c) => c.blocking && (c.status === 'fail' || c.status === 'warn')).length;

  return {
    ok: issues === 0,
    action: 'doctor',
    summary: issues === 0 ? 'No maintenance issues found.' : `${issues} maintenance issue(s) found.`,
    data: { checks, issues, nodeVersion: process.versions.node },
    outputs,
  };
}
