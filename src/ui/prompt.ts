import type { Answers, QuestionDef } from '../actions/types.js';

/**
 * Terminal renderer for the shared question schemas — the ONLY place the
 * CLI touches enquirer. Maps QuestionDef kinds onto enquirer types so every
 * front-end asks identical questions.
 */

export async function askQuestions(defs: QuestionDef[]): Promise<Answers> {
  const { prompt } = await import('enquirer');

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

  return (await prompt<Answers>(questions as Parameters<typeof prompt>[0])) as Answers;
}

export async function confirm(message: string, initial = true): Promise<boolean> {
  const { prompt } = await import('enquirer');
  try {
    const { go } = await prompt<{ go: boolean }>({
      type: 'confirm',
      name: 'go',
      message,
      initial,
    } as Parameters<typeof prompt>[0]);
    return go;
  } catch {
    return false;
  }
}
