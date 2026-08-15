import { join } from 'node:path';
import { writeFileSafe, projectRoot, getProjectName } from '../utils/fs.js';
import { prdTemplate, type PrdInput } from '../generators/prd.js';
import { coercePrdAnswers, PRD_QUESTIONS, type PrdAnswers } from './questions.js';
import type { ActionResult } from './types.js';

export interface PrdActionOptions {
  answers?: Record<string, unknown>;
  force?: boolean;
  /** Headless: without answers return pendingQuestions instead of placeholders. */
  requireAnswers?: boolean;
}

export interface PrdActionData {
  projectName: string;
  answers: PrdAnswers;
  written: boolean;
}

/** Headless PRD generation. Answers may come from chat (MCP) or enquirer (CLI). */
export async function prdAction(opts: PrdActionOptions = {}): Promise<ActionResult<PrdActionData>> {
  const projectName = await getProjectName();

  if (opts.requireAnswers && !opts.answers) {
    return {
      ok: false,
      action: 'prd',
      summary: 'Product questionnaire required — ask the user, then call again.',
      data: { projectName, answers: coercePrdAnswers({}), written: false },
      pendingQuestions: PRD_QUESTIONS,
    };
  }

  const answers = coercePrdAnswers(opts.answers ?? {});
  const input: PrdInput = { projectName, ...answers };
  const written = await writeFileSafe(
    join(projectRoot(), '.vibe', 'PRD.md'),
    prdTemplate(input),
    { overwrite: opts.force === true, quiet: true }
  );

  return {
    ok: true,
    action: 'prd',
    summary: written
      ? `.vibe/PRD.md written${answers.problem ? '' : ' (placeholder sections to fill)'}.`
      : '.vibe/PRD.md already exists — skipped (use force to overwrite).',
    data: { projectName, answers, written },
    outputs: written ? [join('.vibe', 'PRD.md')] : [],
    nextStep: 'plan',
    notes: written && !answers.problem ? ['PRD has placeholder sections — review .vibe/PRD.md'] : [],
  };
}
