import type { Answers, QuestionDef } from '../actions/types.js';

/**
 * Terminal renderer for the shared question schemas — the ONLY place the
 * CLI touches enquirer. Maps QuestionDef kinds onto enquirer types so every
 * front-end asks identical questions.
 */

type PromptFn = (questions: unknown) => Promise<Answers>;

/**
 * enquirer is CJS (`module.exports = Enquirer`, with `.prompt` assigned at
 * runtime) — Node's named-export detection cannot see it, so a bare
 * `const { prompt } = await import('enquirer')` yields undefined in the ESM
 * build. Resolve through the default export instead.
 */
async function getPrompt(): Promise<PromptFn> {
  const mod = (await import('enquirer')) as unknown as {
    prompt?: unknown;
    default?: { prompt?: unknown };
  };
  const fn = mod.prompt ?? mod.default?.prompt;
  if (typeof fn !== 'function') {
    throw new Error('enquirer is unavailable in this environment');
  }
  return fn as PromptFn;
}

export async function askQuestions(defs: QuestionDef[]): Promise<Answers> {
  const prompt = await getPrompt();

  const questions = defs.map((def) => {
    switch (def.kind) {
      case 'confirm':
        return {
          type: 'confirm',
          name: def.id,
          message: def.message,
          initial: typeof def.initial === 'boolean' ? def.initial : false,
        };
      case 'select':
        return {
          type: 'select',
          name: def.id,
          message: def.message,
          choices: (def.options ?? []).map((o) => ({ name: o.value, message: o.label })),
        };
      case 'list':
        return { type: 'list', name: def.id, message: def.message };
      default:
        return { type: 'input', name: def.id, message: def.message };
    }
  });

  return prompt(questions);
}

export async function confirm(message: string, initial = true): Promise<boolean> {
  const prompt = await getPrompt();
  try {
    const { go } = await prompt([{ type: 'confirm', name: 'go', message, initial }]);
    return go === true;
  } catch {
    return false;
  }
}
