/**
 * Headless action layer — the contract shared by the CLI renderers and the
 * MCP server. Actions orchestrate the engines (core/, scanners/, packager/,
 * generators/) and return structured data; they never prompt and never print
 * cosmetics. Unanswered questionnaire input surfaces as `pendingQuestions`
 * so any front-end (terminal enquirer, AI chat) can collect it.
 */

export type QuestionKind = 'input' | 'confirm' | 'select' | 'list';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionDef {
  id: string;
  kind: QuestionKind;
  message: string;
  options?: QuestionOption[];
  initial?: unknown;
}

/** Generic answer map — keys match QuestionDef ids. */
export type Answers = Record<string, string | boolean | string[]>;

export interface ActionResult<T = unknown> {
  ok: boolean;
  action: string;
  /** One-line human summary of what happened. */
  summary: string;
  /** Structured payload (command-specific). */
  data: T;
  /** Files written/updated relative to the project root. */
  outputs?: string[];
  /** Questionnaire input required before the action can complete. */
  pendingQuestions?: QuestionDef[];
  /** Suggested next lifecycle action id. */
  nextStep?: string;
  /** Suggested prompt to ask the AI assistant in chat. */
  suggestedPrompt?: string;
  /** Non-fatal notes (warnings, skips). */
  notes?: string[];
}
