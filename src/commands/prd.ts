import chalk from 'chalk';
import { join } from 'node:path';
import { banner, writeFileSafe, projectRoot, getProjectName } from '../utils/fs.js';
import { prdTemplate, type PrdInput } from '../generators/prd.js';

interface PrdOptions {
  yes?: boolean;
  force?: boolean;
}

interface PrdAnswers {
  problem: string;
  targetUsers: string;
  mainFeatures: string[];
  successMetrics: string[];
  outOfScope: string[];
}

async function runPrdQuestionnaire(): Promise<PrdAnswers> {
  const { prompt } = await import('enquirer');

  const answers = await prompt<PrdAnswers>([
    {
      type: 'input',
      name: 'problem',
      message: '🎯  What problem does this product solve?',
    },
    {
      type: 'input',
      name: 'targetUsers',
      message: '👥  Who are the target users (primary persona)?',
    },
    {
      type: 'list',
      name: 'mainFeatures',
      message: '✨  Core MVP features (comma-separated):',
    },
    {
      type: 'list',
      name: 'successMetrics',
      message: '📈  Success metrics (comma-separated):',
    },
    {
      type: 'list',
      name: 'outOfScope',
      message: '🚫  Explicitly out of scope for the MVP (comma-separated):',
    },
  ] as Parameters<typeof prompt>[0]);

  return answers;
}

export async function prdCommand(opts: PrdOptions): Promise<void> {
  banner('VibeHarness · PRD');

  const projectName = await getProjectName();

  let answers: PrdAnswers = {
    problem: '',
    targetUsers: '',
    mainFeatures: [],
    successMetrics: [],
    outOfScope: [],
  };

  if (!opts.yes) {
    console.log(chalk.bold('\n📋  Product Questionnaire\n'));
    try {
      answers = await runPrdQuestionnaire();
    } catch {
      console.log(chalk.yellow('\n  Questionnaire skipped — generating placeholder PRD.\n'));
    }
  } else {
    console.log(chalk.dim('  --yes flag set: generating placeholder PRD.\n'));
  }

  const input: PrdInput = { projectName, ...answers };
  const vibeDir = join(projectRoot(), '.vibe');
  const written = await writeFileSafe(join(vibeDir, 'PRD.md'), prdTemplate(input), opts.force);

  if (written) {
    console.log(chalk.dim([
      '',
      '  Next steps:',
      '    1. Fill the placeholder sections in .vibe/PRD.md',
      '    2. npx @vibeharness/cli plan   → curated stack recommendation',
      '    3. npx @vibeharness/cli pack   → sanitised context for your AI assistant',
    ].join('\n') + '\n'));
  }
}
