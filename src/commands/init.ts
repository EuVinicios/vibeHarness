import chalk from 'chalk';
import ora from 'ora';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, appendFile, writeFile, chmod } from 'node:fs/promises';
import { banner, writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import { specTemplate, constitutionTemplate } from '../generators/spec.js';
import { masterRulesTemplate, cursorRulesTemplate, claudeMdTemplate, windsurfRulesTemplate, copilotInstructionsTemplate } from '../generators/rules.js';
import { lgpdPolicyTemplate } from '../generators/lgpd-policy.js';

interface InitOptions {
  yes?: boolean;
}

interface ThreatModel {
  hasPayments: boolean;
  hasAuth: boolean;
  hasSensitiveData: boolean;
  country: string;
}

async function runThreatQuestionnaire(): Promise<ThreatModel> {
  const { prompt } = await import('enquirer');

  const answers = await prompt<ThreatModel>([
    {
      type: 'confirm',
      name: 'hasPayments',
      message: '💳  Does this project handle payments (Stripe, Pagar.me, PIX)?',
      initial: false,
    },
    {
      type: 'confirm',
      name: 'hasAuth',
      message: '🔐  Does this project have user authentication?',
      initial: true,
    },
    {
      type: 'confirm',
      name: 'hasSensitiveData',
      message: '🛡️   Does this project store PII / sensitive data (LGPD/GDPR scope)?',
      initial: false,
    },
    {
      type: 'select',
      name: 'country',
      message: '🌍  Primary regulatory scope?',
      choices: [
        { name: 'brazil', message: '🇧🇷 Brazil (LGPD)' },
        { name: 'eu',     message: '🇪🇺 European Union (GDPR)' },
        { name: 'global', message: '🌐 Global (LGPD + GDPR aligned)' },
      ],
    },
  ] as Parameters<typeof prompt>[0]);

  return answers;
}

async function installPreCommitHook(): Promise<void> {
  const root = projectRoot();
  const gitDir = join(root, '.git');
  if (!existsSync(gitDir)) return; // not a git repo

  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');

  const vibeHarnessHookSnippet = `
# --- vibe-harness secret scanner ---
VH_PATTERNS="sk_live_|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY"
VH_STAGED=$(git diff --cached --name-only 2>/dev/null)
for VH_FILE in $VH_STAGED; do
  if [ -f "$VH_FILE" ]; then
    if grep -Eq "$VH_PATTERNS" "$VH_FILE" 2>/dev/null; then
      echo ""
      echo "🚨 vibe-harness: Potential secret detected in: $VH_FILE"
      echo "   Commit blocked. Move secrets to environment variables."
      echo ""
      exit 1
    fi
  fi
done
# --- end vibe-harness ---
`;

  if (existsSync(hookPath)) {
    // Hook already exists — append only if our snippet is not already present
    const existing = await readFile(hookPath, 'utf8');
    if (existing.includes('vibe-harness secret scanner')) {
      console.log(chalk.dim('  ↷  Pre-commit hook already contains vibe-harness scanner — skipped'));
      return;
    }
    // Append to existing hook (supports Husky, lint-staged, etc.)
    await appendFile(hookPath, vibeHarnessHookSnippet, 'utf8');
    console.log(chalk.green('  ✔  vibe-harness scanner appended to existing pre-commit hook'));
    return;
  }

  // No existing hook — create a fresh one
  const freshHook = `#!/bin/sh
# pre-commit hook — installed by vibe-harness
# Blocks commits containing API keys / private keys
${vibeHarnessHookSnippet}exit 0
`;
  await writeFile(hookPath, freshHook, 'utf8');
  await chmod(hookPath, 0o755);
  console.log(chalk.green('  ✔  Pre-commit hook installed (.git/hooks/pre-commit)'));
}

export async function initCommand(opts: InitOptions): Promise<void> {
  banner('VibeHarness · INIT');

  const spinner = ora('Detecting project stack…').start();
  const stack = await detectStack();
  const projectName = await getProjectName();
  spinner.succeed(`Stack detected: ${stack.length ? stack.join(', ') : 'Generic'}`);

  let threatModel: ThreatModel = {
    hasPayments: false,
    hasAuth: false,
    hasSensitiveData: false,
    country: 'brazil',
  };

  if (!opts.yes) {
    console.log(chalk.bold('\n🔍  Quick Threat Model Questionnaire\n'));
    try {
      threatModel = await runThreatQuestionnaire();
    } catch {
      console.log(chalk.yellow('\n  Questionnaire skipped — using safe defaults.\n'));
    }
  } else {
    console.log(chalk.dim('  --yes flag set: using safe defaults.\n'));
  }

  console.log('\n' + chalk.bold('📝  Generating project files…\n'));

  const root = projectRoot();
  const vibeDir = join(root, '.vibe');
  const usesSupabase = stack.includes('Supabase');

  // .vibe/ spec files
  await writeFileSafe(join(vibeDir, 'SPEC.md'), specTemplate(projectName, stack));
  await writeFileSafe(join(vibeDir, 'CONSTITUTION.md'), constitutionTemplate(projectName));
  await writeFileSafe(join(vibeDir, 'LGPD_POLICY.md'), lgpdPolicyTemplate({
    projectName,
    ...threatModel,
  }));
  await writeFileSafe(
    join(vibeDir, 'threat-model.json'),
    JSON.stringify({ projectName, stack, ...threatModel }, null, 2)
  );

  // AI rule files
  console.log('\n' + chalk.bold('✍️  Generating AI assistant rules…\n'));
  const masterRules = masterRulesTemplate({
    projectName,
    stack,
    hasPayments: threatModel.hasPayments,
    hasAuth: threatModel.hasAuth,
    hasSensitiveData: threatModel.hasSensitiveData,
    usesSupabase,
  });

  await writeFileSafe(join(root, '.cursorrules'), cursorRulesTemplate(masterRules));
  await writeFileSafe(
    join(root, '.cursor', 'rules', 'vibeharness.mdc'),
    '---\ndescription: VibeHarness security & architecture guardrails\nglobs: ["**/*"]\n---\n\n' + masterRules
  );
  await writeFileSafe(join(root, 'CLAUDE.md'), claudeMdTemplate(masterRules, projectName));
  await writeFileSafe(join(root, '.windsurfrules'), windsurfRulesTemplate(masterRules));
  await writeFileSafe(
    join(root, '.github', 'copilot-instructions.md'),
    copilotInstructionsTemplate(masterRules)
  );

  // .gitignore
  const gitignorePath = join(root, '.gitignore');
  const existing = existsSync(gitignorePath)
    ? await readFile(gitignorePath, 'utf8')
    : '';
  if (!existing.includes('# vibe-harness')) {
    await appendFile(
      gitignorePath,
      '\n# vibe-harness — keep spec files versioned\n!.vibe/\n',
      'utf8'
    );
    console.log(chalk.green('  ✔  Updated .gitignore'));
  }

  // Pre-commit hook
  console.log('\n' + chalk.bold('🪝  Installing pre-commit hook…\n'));
  await installPreCommitHook();

  console.log('\n' + chalk.bold.green('✅  VibeHarness initialised!'));
  console.log(chalk.dim([
    '',
    '  Generated:',
    '    .vibe/SPEC.md                      ← project specification',
    '    .vibe/CONSTITUTION.md              ← architecture laws',
    '    .vibe/LGPD_POLICY.md               ← LGPD compliance checklist',
    '    .cursorrules / CLAUDE.md / etc.    ← AI assistant rules',
    '    .git/hooks/pre-commit              ← secret blocker hook',
    '',
    '  Next steps:',
    '    npx vibe-harness pack   → build sanitised context for AI',
    '    npx vibe-harness audit  → run production readiness check',
  ].join('\n') + '\n'));
}
