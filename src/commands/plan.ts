import chalk from 'chalk';
import ora from 'ora';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { banner, writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import { loadCatalog, isCatalogStale, catalogViolations } from '../registry/index.js';
import { stackPlanTemplate, type StackPlanInput } from '../generators/stack-plan.js';

interface PlanOptions {
  yes?: boolean;
  force?: boolean;
  type?: string;
}

const PROJECT_TYPES = ['fullstack-web', 'api', 'landing', 'saas'] as const;
type ProjectType = (typeof PROJECT_TYPES)[number];

async function askProjectType(): Promise<ProjectType> {
  const { prompt } = await import('enquirer');
  const { projectType } = await prompt<{ projectType: ProjectType }>({
    type: 'select',
    name: 'projectType',
    message: '🧭  What kind of project is this?',
    choices: [
      { name: 'fullstack-web', message: '🌐 Fullstack web app' },
      { name: 'saas', message: '💼 SaaS product (multi-tenant)' },
      { name: 'api', message: '🔌 API / backend only' },
      { name: 'landing', message: '📄 Landing / content site' },
    ],
  } as Parameters<typeof prompt>[0]);
  return projectType;
}

interface StoredThreatModel {
  hasPayments?: boolean;
  hasAuth?: boolean;
  hasSensitiveData?: boolean;
}

async function readThreatModel(): Promise<StoredThreatModel | null> {
  const path = join(projectRoot(), '.vibe', 'threat-model.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as StoredThreatModel;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    // Fail loud: a silently-ignored threat model would generate a stack plan
    // without auth/payments guardrails — the user must know why.
    console.log(chalk.yellow('  ⚠  .vibe/threat-model.json is INVALID (parse error) — ignored.'));
    console.log(chalk.yellow('     Re-run `npx @vibeharness/cli init` to regenerate it before relying on the plan.'));
    return null;
  }
}

export async function planCommand(opts: PlanOptions): Promise<void> {
  banner('VibeHarness · PLAN');

  const spinner = ora('Loading curated registry…').start();
  const catalog = await loadCatalog();
  if (!catalog) {
    spinner.fail('Could not load registry/catalog.json — is the package installed correctly?');
    process.exit(1);
  }
  const stale = isCatalogStale(catalog);
  const violations = catalogViolations(catalog);
  spinner.succeed(
    `Registry loaded (last sync: ${catalog.lastSync})${stale ? chalk.yellow(' — stale, > 30 days') : ''}`
  );
  if (violations.length > 0) {
    console.log(chalk.yellow(`  ⚠  ${violations.length} registry entr(y|ies) violate curation criteria:`));
    for (const v of violations.slice(0, 5)) console.log(chalk.yellow(`     - ${v}`));
    console.log(chalk.dim('     Recommendations below may be outdated — verify before adopting.'));
  }

  const stack = await detectStack();
  const projectName = await getProjectName();
  const threatModel = await readThreatModel();
  if (!threatModel) {
    console.log(chalk.dim('  No .vibe/threat-model.json found — run `npx @vibeharness/cli init` for tailored rules.'));
  }

  let projectType: ProjectType;
  if (opts.type && (PROJECT_TYPES as readonly string[]).includes(opts.type)) {
    projectType = opts.type as ProjectType;
  } else if (opts.yes) {
    projectType = 'fullstack-web';
  } else {
    try {
      projectType = await askProjectType();
    } catch {
      console.log(chalk.yellow('  Selection skipped — defaulting to fullstack-web.'));
      projectType = 'fullstack-web';
    }
  }

  const input: StackPlanInput = {
    projectName,
    projectType,
    catalog,
    catalogStale: stale,
    threatModel: threatModel
      ? {
          hasPayments: threatModel.hasPayments ?? false,
          hasAuth: threatModel.hasAuth ?? true,
          hasSensitiveData: threatModel.hasSensitiveData ?? false,
        }
      : null,
    detectedStack: stack,
  };

  const vibeDir = join(projectRoot(), '.vibe');
  const written = await writeFileSafe(join(vibeDir, 'STACK.md'), stackPlanTemplate(input), opts.force);

  if (written) {
    console.log(chalk.dim([
      '',
      '  Next steps:',
      '    1. Review .vibe/STACK.md and confirm each primary choice',
      '    2. Copy accepted decisions into .vibe/SPEC.md (section 4)',
      '    3. npx @vibeharness/cli doctor --fix → install Dependabot',
    ].join('\n') + '\n'));
  }
}
