import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, appendFile, writeFile, chmod } from 'node:fs/promises';
import { writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import { specTemplate, constitutionTemplate } from '../generators/spec.js';
import {
  masterRulesTemplate,
  cursorRulesTemplate,
  claudeMdTemplate,
  windsurfRulesTemplate,
  copilotInstructionsTemplate,
} from '../generators/rules.js';
import { lgpdPolicyTemplate } from '../generators/lgpd-policy.js';
import {
  skillMdTemplate,
  slashCommandTemplate,
  agentsMdTemplate,
  type SlashCommandName,
} from '../generators/skill.js';
import { securityWorkflowTemplate } from '../generators/security-workflow.js';
import { coerceThreatModel, THREAT_MODEL_QUESTIONS, type ThreatModelAnswers } from './questions.js';
import type { ActionResult } from './types.js';

export interface InitActionOptions {
  answers?: Record<string, unknown>;
  force?: boolean;
  quiet?: boolean;
  /**
   * Headless callers (MCP) set this to refuse default answers: when no
   * answers are provided the action returns pendingQuestions WITHOUT
   * writing, so the AI can ask the human in chat first.
   */
  requireAnswers?: boolean;
}

export interface InitActionData {
  stack: string[];
  threatModel: ThreatModelAnswers & { projectName: string; stack: string[] };
}

const PRE_COMMIT_SNIPPET = `
# --- vibe-harness secret scanner ---
if command -v gitleaks >/dev/null 2>&1; then
  # gitleaks available — full 150+ rule detection set
  if ! gitleaks protect --staged --redact -v; then
    echo ""
    echo "🚨 vibe-harness: gitleaks detected secrets in staged files."
    echo "   Commit blocked. Move secrets to environment variables."
    exit 1
  fi
else
  # Fallback: grep with the most critical patterns (two tiers).
  #   VH_CRITICAL — vendor-key families: block ALWAYS, even in files listed
  #                 in .vibe/auditignore (non-test files), mirroring the
  #                 v0.9 audit rule that criticals cannot be suppressed.
  #   VH_GENERIC  — generic password/secret assignments with long literals:
  #                 skipped for auditignored files (fixture workflow).
  # Reads staged files from a temp file so the loop runs in THIS shell
  # (pipeline subshells cannot abort the hook) and filenames with spaces work.
  VH_CRITICAL="sk_live_[0-9a-zA-Z]{24,}|pk_live_[0-9a-zA-Z]{24,}|sk_test_[0-9a-zA-Z]{24,}|sk-ant-[0-9a-zA-Z_-]{20,}|sk-proj-[0-9a-zA-Z_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}|glpat-[0-9A-Za-z_-]{20,}|xox[abprs]-|AIza[0-9A-Za-z_-]{35}|hf_[A-Za-z0-9]{30,}|SG\\.[0-9A-Za-z_-]{16,}|re_[A-Za-z0-9]{32,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{33}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY"
  VH_GENERIC="(password|passwd|api[_-]?key|secret)[\\"']?[[:space:]]*[:=][[:space:]]*[\\"'][^\\"']{12,}[\\"']"
  VH_TMP="$(mktemp)"
  git diff --cached --name-only > "$VH_TMP" 2>/dev/null
  VH_BLOCKED=0
  while IFS= read -r VH_FILE; do
    [ -n "$VH_FILE" ] || continue
    VH_IGNORED=0
    if [ -f ".vibe/auditignore" ]; then
      while IFS= read -r VH_IGN; do
        case "$VH_IGN" in ""|'#'*) continue ;; esac
        # v0.9 inline reasons (path # reason) — strip and trim before matching
        VH_IGN="\${VH_IGN%%#*}"
        VH_IGN=$(printf '%s' "$VH_IGN" | tr -d '[:space:]')
        [ -n "$VH_IGN" ] || continue
        case "$VH_FILE" in
          $VH_IGN) VH_IGNORED=1; break ;;
        esac
      done < ".vibe/auditignore"
    fi
    [ -f "$VH_FILE" ] || continue
    VH_SCAN_CRIT=1
    VH_SCAN_GEN=1
    if [ "$VH_IGNORED" -eq 1 ]; then
      # Test fixtures keep full suppression (documented workflow);
      # non-test ignored files still block on vendor criticals.
      case "$VH_FILE" in
        *.test.*|*.spec.*|*test_*.py|*conftest.py|*/tests/*|*/__tests__/*|*/fixtures/*) VH_SCAN_CRIT=0; VH_SCAN_GEN=0 ;;
        *) VH_SCAN_GEN=0 ;;
      esac
    fi
    if [ "$VH_SCAN_CRIT" -eq 1 ] && grep -Eq "$VH_CRITICAL" "$VH_FILE" 2>/dev/null; then
      echo ""
      echo "🚨 vibe-harness: Potential secret detected in: $VH_FILE"
      echo "   Commit blocked. Move secrets to environment variables."
      VH_BLOCKED=1
    elif [ "$VH_SCAN_GEN" -eq 1 ] && grep -Eq "$VH_GENERIC" "$VH_FILE" 2>/dev/null; then
      echo ""
      echo "🚨 vibe-harness: Potential hardcoded credential detected in: $VH_FILE"
      echo "   Commit blocked. Move the value to an environment variable (or"
      echo "   shorten the placeholder in tests). Install gitleaks for fewer false"
      echo "   positives: https://github.com/gitleaks/gitleaks"
      VH_BLOCKED=1
    fi
  done < "$VH_TMP"
  rm -f "$VH_TMP"
  [ "$VH_BLOCKED" -eq 1 ] && exit 1
fi
# --- end vibe-harness ---
`;

export interface PreCommitResult {
  status: 'installed' | 'appended' | 'skipped-existing' | 'skipped-no-git';
}

export async function installPreCommitHook(quiet = false): Promise<PreCommitResult> {
  const root = projectRoot();
  const gitDir = join(root, '.git');
  if (!existsSync(gitDir)) return { status: 'skipped-no-git' };

  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');

  if (existsSync(hookPath)) {
    const existing = await readFile(hookPath, 'utf8');
    if (existing.includes('vibe-harness secret scanner')) {
      if (!quiet) console.log('  ↷  Pre-commit hook already contains vibe-harness scanner — skipped');
      return { status: 'skipped-existing' };
    }
    await appendFile(hookPath, PRE_COMMIT_SNIPPET, 'utf8');
    if (!quiet) console.log('  ✔  vibe-harness scanner appended to existing pre-commit hook');
    return { status: 'appended' };
  }

  const freshHook = `#!/bin/sh
# pre-commit hook — installed by vibe-harness
# Blocks commits containing API keys / private keys
${PRE_COMMIT_SNIPPET}exit 0
`;
  await writeFile(hookPath, freshHook, 'utf8');
  await chmod(hookPath, 0o755);
  if (!quiet) console.log('  ✔  Pre-commit hook installed (.git/hooks/pre-commit)');
  return { status: 'installed' };
}

/**
 * Headless init: writes the .vibe/ spec layer, AI rules, agent skill layer,
 * security workflow, .gitignore entry and the pre-commit secret hook.
 * Without `answers` the safe-default threat model is used; the MCP layer
 * surfaces THREAT_MODEL_QUESTIONS to collect answers in chat first.
 */
export async function initAction(opts: InitActionOptions = {}): Promise<ActionResult<InitActionData>> {
  const root = projectRoot();
  const stack = await detectStack();
  const projectName = await getProjectName();

  if (opts.requireAnswers && !opts.answers) {
    return {
      ok: false,
      action: 'init',
      summary: 'Threat-model answers required before initialising — ask the user, then call again.',
      data: { stack, threatModel: { projectName, stack, hasPayments: false, hasAuth: false, hasSensitiveData: false, country: 'brazil' } },
      pendingQuestions: THREAT_MODEL_QUESTIONS,
    };
  }

  const answers = opts.answers
    ? coerceThreatModel(opts.answers)
    : { hasPayments: false, hasAuth: false, hasSensitiveData: false, country: 'brazil' };

  const threatModel = { projectName, stack, ...answers };
  const usesSupabase = stack.includes('Supabase');
  const write = (filePath: string, content: string): Promise<boolean> =>
    writeFileSafe(filePath, content, { overwrite: opts.force === true, quiet: true });

  const outputs: string[] = [];
  const track = async (rel: string, content: string): Promise<void> => {
    if (await write(join(root, rel), content)) outputs.push(rel);
  };

  await track(join('.vibe', 'SPEC.md'), specTemplate(projectName, stack));
  await track(join('.vibe', 'CONSTITUTION.md'), constitutionTemplate(projectName));
  await track(
    join('.vibe', 'LGPD_POLICY.md'),
    lgpdPolicyTemplate({ projectName, ...answers })
  );
  await track(
    join('.vibe', 'threat-model.json'),
    JSON.stringify(threatModel, null, 2) + '\n'
  );

  const masterRules = masterRulesTemplate({
    projectName,
    stack,
    hasPayments: answers.hasPayments,
    hasAuth: answers.hasAuth,
    hasSensitiveData: answers.hasSensitiveData,
    usesSupabase,
  });

  await track('.cursorrules', cursorRulesTemplate(masterRules));
  await track(
    join('.cursor', 'rules', 'vibeharness.mdc'),
    '---\ndescription: VibeHarness security & architecture guardrails\nglobs: ["**/*"]\n---\n\n' + masterRules
  );
  await track('CLAUDE.md', claudeMdTemplate(masterRules, projectName));
  await track('.windsurfrules', windsurfRulesTemplate(masterRules));
  await track(
    join('.github', 'copilot-instructions.md'),
    copilotInstructionsTemplate(masterRules)
  );

  await track(join('.claude', 'skills', 'vibeharness', 'SKILL.md'), skillMdTemplate(projectName));
  const slashCommands: SlashCommandName[] = ['status', 'install', 'prd', 'plan', 'pack', 'audit', 'doctor', 'start'];
  for (const cmd of slashCommands) {
    await track(join('.claude', 'commands', `${cmd}.md`), slashCommandTemplate(cmd));
  }
  await track('AGENTS.md', agentsMdTemplate(projectName, stack));
  await track(
    join('.github', 'workflows', 'security.yml'),
    securityWorkflowTemplate(projectName)
  );

  const notes: string[] = [];
  const gitignorePath = join(root, '.gitignore');
  const existing = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf8') : '';
  if (!existing.includes('# vibe-harness')) {
    await appendFile(gitignorePath, '\n# vibe-harness — keep spec files versioned\n!.vibe/\n', 'utf8');
    outputs.push('.gitignore');
    notes.push('.gitignore updated (keep .vibe/ versioned)');
  }

  const hook = await installPreCommitHook(true);
  if (hook.status === 'installed' || hook.status === 'appended') {
    outputs.push('.git/hooks/pre-commit');
    notes.push(`pre-commit hook ${hook.status}`);
  }

  // Baseline the guardrails for tamper detection (verified on every audit).
  const { writeGuardrailsManifest, GUARDRAILS_MANIFEST_PATH } = await import('../utils/guardrails.js');
  await writeGuardrailsManifest(root);
  outputs.push(GUARDRAILS_MANIFEST_PATH);

  return {
    ok: true,
    action: 'init',
    summary: `Harness foundation written (${outputs.length} outputs) — spec, rules, skill layer, security CI, pre-commit hook.`,
    data: { stack, threatModel },
    outputs,
    nextStep: 'prd',
    notes,
  };
}
