import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectRoot } from './fs.js';
import type { Finding } from '../core/types.js';

const execFileAsync = promisify(execFile);

/**
 * Guardrails anti-tamper manifest (v0.9).
 *
 * The harness's protections are files living in the user's repo — and files
 * can be edited or deleted (by a frustrated vibecoder OR by an AI agent
 * "fixing" a bug quickly). `init` baselines the state of the guardrails in
 * `.vibe/guardrails.json`; every audit verifies the current state against
 * the baseline and surfaces drift as findings — turning "instructional"
 * guardrails into verifiable ones.
 *
 * The manifest records STATE, not instructions — it is data and can never
 * influence the agent beyond the findings derived from it.
 */

export const GUARDRAILS_MANIFEST_PATH = join('.vibe', 'guardrails.json');
export const HOOK_MARKER = 'vibe-harness secret scanner';

export interface GuardrailsManifest {
  version: 1;
  constitutionSha256: string;
  envIgnoredByGit: boolean;
  hookInstalled: boolean;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Current live state of the guardrails (what verify compares against). */
export async function currentGuardrailsState(root: string): Promise<Omit<GuardrailsManifest, 'version'>> {
  const constitution = await readIfPresent(join(root, '.vibe', 'CONSTITUTION.md'));
  const gitignore = await readIfPresent(join(root, '.gitignore')) ?? '';
  const hook = await readIfPresent(join(root, '.git', 'hooks', 'pre-commit'));

  const gitignoreLines = gitignore
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const envIgnoredByGit = gitignoreLines.some((l) => /^(\*\*\/|\/)?\.env(\.|$|\*)/.test(l));

  return {
    constitutionSha256: constitution === null ? '' : sha256(constitution),
    envIgnoredByGit,
    hookInstalled: hook !== null && hook.includes(HOOK_MARKER),
  };
}

/** Writes the baseline manifest — called by `init` after all guardrails exist. */
export async function writeGuardrailsManifest(root: string): Promise<void> {
  const state = await currentGuardrailsState(root);
  const manifest: GuardrailsManifest = { version: 1, ...state };
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(join(root, '.vibe'), { recursive: true });
  await writeFile(join(root, GUARDRAILS_MANIFEST_PATH), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

async function gitHooksPath(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: root,
      maxBuffer: 1024,
    });
    const v = stdout.trim();
    return v.length > 0 ? v : null;
  } catch {
    return null; // not set / not a repo — both fine
  }
}

/**
 * Verifies guardrails against the baseline. Findings land in the security
 * section — a removed constitution or unignored .env is at least as severe
 * as a leaked secret pattern.
 */
export async function verifyGuardrails(): Promise<Finding[]> {
  const root = projectRoot();
  const findings: Finding[] = [];

  // 1) core.hooksPath redirect — bypasses .git/hooks/pre-commit entirely.
  // Checked regardless of manifest: redirecting hooks is always suspicious.
  const hooksPath = await gitHooksPath(root);
  if (hooksPath !== null && !/^\.(\/|$)|^\.git(\/|$)/.test(hooksPath)) {
    findings.push({
      severity: 'high',
      category: 'guardrails',
      message: `git core.hooksPath is redirected to "${hooksPath}" — the vibe-harness pre-commit hook in .git/hooks is silently bypassed`,
      fix: 'Run `git config --unset core.hooksPath` (or point it at a directory that includes the vibe-harness secret scanner). Hook redirection is the classic way to disable secret blocking without deleting files.',
    });
  }

  const raw = await readIfPresent(join(root, GUARDRAILS_MANIFEST_PATH));
  if (raw === null) {
    findings.push({
      severity: 'info',
      category: 'guardrails',
      message: 'Guardrails manifest (.vibe/guardrails.json) not found — tamper detection is off',
      fix: 'Run `npx @vibeharness/cli init` to baseline the constitution, .gitignore and pre-commit hook state. Re-init after intentionally changing any guardrail.',
    });
    return findings;
  }

  let manifest: GuardrailsManifest;
  try {
    manifest = JSON.parse(raw) as GuardrailsManifest;
    if (typeof manifest.constitutionSha256 !== 'string') throw new Error('invalid');
  } catch {
    findings.push({
      severity: 'medium',
      category: 'guardrails',
      message: 'Guardrails manifest is corrupted — tamper detection cannot run',
      fix: 'Run `npx @vibeharness/cli init` to rewrite a valid baseline.',
    });
    return findings;
  }

  const state = await currentGuardrailsState(root);

  if (manifest.envIgnoredByGit && !state.envIgnoredByGit) {
    findings.push({
      severity: 'critical',
      category: 'guardrails',
      message: '.env was removed from .gitignore after the harness baseline — local secrets can now be committed',
      fix: 'Re-add `.env` and `.env*.local` to .gitignore immediately. Removing the ignore entry is a classic exfiltration step (deliberate or AI-driven). If the removal was intentional, re-run init to re-baseline — knowingly.',
    });
  }

  if (manifest.hookInstalled && !state.hookInstalled) {
    const hookFile = existsSync(join(root, '.git', 'hooks', 'pre-commit'));
    findings.push({
      severity: 'high',
      category: 'guardrails',
      message: hookFile
        ? 'The pre-commit hook lost the vibe-harness secret scanner block (edited or replaced)'
        : 'The pre-commit secret-blocker hook (.git/hooks/pre-commit) was deleted',
      fix: 'Run `npx @vibeharness/cli init` to reinstall the hook, then verify with `git commit --dry-run` on a file containing a fake key. A missing secret hook means leaked credentials reach git history.',
    });
  }

  if (manifest.constitutionSha256 !== state.constitutionSha256) {
    if (state.constitutionSha256 === '') {
      findings.push({
        severity: 'critical',
        category: 'guardrails',
        message: '.vibe/CONSTITUTION.md was deleted — the project\'s non-negotiable security laws are gone',
        fix: 'Restore it with `npx @vibeharness/cli init` (or `git checkout .vibe/CONSTITUTION.md`). Deleting the constitution removes the guardrails every AI agent in this repo was operating under.',
      });
    } else {
      findings.push({
        severity: 'medium',
        category: 'guardrails',
        message: '.vibe/CONSTITUTION.md changed since the last `init` baseline',
        fix: 'If you weakened it deliberately, re-run init to re-baseline. If you did not change it, inspect `git diff .vibe/CONSTITUTION.md` — an agent may have edited the guardrails.',
      });
    }
  }

  return findings;
}
