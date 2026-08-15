import type { QuestionDef } from './types.js';

/**
 * Questionnaire definitions — single source of truth consumed by BOTH
 * front-ends: the CLI renders them with enquirer, the MCP server returns
 * them as structured JSON so the AI can ask in chat.
 */

export const THREAT_MODEL_QUESTIONS: QuestionDef[] = [
  {
    id: 'hasPayments',
    kind: 'confirm',
    message: 'Does this project handle payments (Stripe, Pagar.me, PIX)?',
    initial: false,
  },
  {
    id: 'hasAuth',
    kind: 'confirm',
    message: 'Does this project have user authentication?',
    initial: true,
  },
  {
    id: 'hasSensitiveData',
    kind: 'confirm',
    message: 'Does this project store PII / sensitive data (LGPD/GDPR scope)?',
    initial: false,
  },
  {
    id: 'country',
    kind: 'select',
    message: 'Primary regulatory scope?',
    options: [
      { value: 'brazil', label: 'Brazil (LGPD)' },
      { value: 'eu', label: 'European Union (GDPR)' },
      { value: 'global', label: 'Global (LGPD + GDPR aligned)' },
    ],
  },
];

export const PRD_QUESTIONS: QuestionDef[] = [
  { id: 'problem', kind: 'input', message: 'What problem does this product solve?' },
  { id: 'targetUsers', kind: 'input', message: 'Who are the target users (primary persona)?' },
  { id: 'mainFeatures', kind: 'list', message: 'Core MVP features (comma-separated):' },
  { id: 'successMetrics', kind: 'list', message: 'Success metrics (comma-separated):' },
  { id: 'outOfScope', kind: 'list', message: 'Explicitly out of scope for the MVP (comma-separated):' },
];

export const PROJECT_TYPE_QUESTION: QuestionDef = {
  id: 'projectType',
  kind: 'select',
  message: 'What kind of project is this?',
  options: [
    { value: 'fullstack-web', label: 'Fullstack web app' },
    { value: 'saas', label: 'SaaS product (multi-tenant)' },
    { value: 'api', label: 'API / backend only' },
    { value: 'landing', label: 'Landing / content site' },
  ],
  initial: 'fullstack-web',
};

export const STAGE_QUESTION: QuestionDef = {
  id: 'stage',
  kind: 'select',
  message: 'Em que fase seu projeto está hoje?',
  options: [
    { value: 'idea', label: 'Idea — ainda nem comecei a codar' },
    { value: 'starting', label: 'Starting — projeto (quase) vazio' },
    { value: 'building', label: 'Building — codando ativamente' },
    { value: 'shipping', label: 'Shipping — revisão final antes de produzir' },
    { value: 'production', label: 'Production — já no ar, modo manutenção' },
  ],
  initial: 'starting',
};

export const PROJECT_TYPES = ['fullstack-web', 'api', 'landing', 'saas'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ThreatModelAnswers {
  hasPayments: boolean;
  hasAuth: boolean;
  hasSensitiveData: boolean;
  country: string;
}

export interface PrdAnswers {
  problem: string;
  targetUsers: string;
  mainFeatures: string[];
  successMetrics: string[];
  outOfScope: string[];
}

/** Coerce loose answer values (strings from AI chat) into a threat model. */
export function coerceThreatModel(raw: Record<string, unknown>): ThreatModelAnswers {
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback;
  const country = typeof raw.country === 'string' && raw.country ? raw.country : 'brazil';
  return {
    hasPayments: bool(raw.hasPayments, false),
    hasAuth: bool(raw.hasAuth, true),
    hasSensitiveData: bool(raw.hasSensitiveData, false),
    country: ['brazil', 'eu', 'global'].includes(country) ? country : 'global',
  };
}

/** Coerce loose answer values into PRD answers (lists accept arrays or CSV). */
export function coercePrdAnswers(raw: Record<string, unknown>): PrdAnswers {
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x).trim()).filter(Boolean)
      : str(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
  return {
    problem: str(raw.problem),
    targetUsers: str(raw.targetUsers),
    mainFeatures: list(raw.mainFeatures),
    successMetrics: list(raw.successMetrics),
    outOfScope: list(raw.outOfScope),
  };
}
