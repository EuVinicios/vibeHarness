import chalk from 'chalk';
import ora from 'ora';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { banner, writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import {
  masterRulesTemplate,
  cursorRulesTemplate,
  claudeMdTemplate,
  windsurfRulesTemplate,
  copilotInstructionsTemplate,
} from '../generators/rules.js';

interface RulesOptions {
  tools: string;
}

interface ThreatModel {
  projectName: string;
  stack: string[];
  hasPayments: boolean;
  hasAuth: boolean;
  hasSensitiveData: boolean;
}

async function loadThreatModel(): Promise<ThreatModel | null> {
  const path = join(projectRoot(), '.vibe', 'threat-model.json');
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as ThreatModel;
  } catch {
    return null;
  }
}

export async function rulesCommand(opts: RulesOptions): Promise<void> {
  banner('VibeHarness · RULES GENERATOR');

  const spinner = ora('Loading project context…').start();

  const threatModel = await loadThreatModel();
  const stack = threatModel?.stack ?? (await detectStack());
  const projectName = threatModel?.projectName ?? (await getProjectName());
  const usesSupabase = stack.includes('Supabase');

  spinner.succeed('Project context loaded');

  const masterRules = masterRulesTemplate({
    projectName,
    stack,
    hasPayments: threatModel?.hasPayments ?? false,
    hasAuth: threatModel?.hasAuth ?? false,
    hasSensitiveData: threatModel?.hasSensitiveData ?? false,
    usesSupabase,
  });

  const tools = opts.tools
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  console.log('\n' + chalk.bold('✍️  Writing rule files…\n'));

  const root = projectRoot();

  if (tools.includes('cursor')) {
    await writeFileSafe(join(root, '.cursorrules'), cursorRulesTemplate(masterRules), true);
    // Also write MDC format for newer Cursor versions
    await writeFileSafe(
      join(root, '.cursor', 'rules', 'vibeharness.mdc'),
      '---\ndescription: VibeHarness security & architecture guardrails\nglobs: ["**/*"]\n---\n\n' +
        masterRules,
      true
    );
  }

  if (tools.includes('claude')) {
    await writeFileSafe(join(root, 'CLAUDE.md'), claudeMdTemplate(masterRules, projectName), true);
  }

  if (tools.includes('windsurf')) {
    await writeFileSafe(
      join(root, '.windsurfrules'),
      windsurfRulesTemplate(masterRules),
      true
    );
  }

  if (tools.includes('copilot')) {
    await writeFileSafe(
      join(root, '.github', 'copilot-instructions.md'),
      copilotInstructionsTemplate(masterRules),
      true
    );
  }

  console.log('\n' + chalk.bold.green('✅  AI rule files generated!'));
  console.log(
    chalk.dim(
      `  Tools targeted: ${tools.join(', ')}\n  Next: run \`vibe-harness audit\` before shipping.\n`
    )
  );
}
