import type { ActionId } from '../core/stage.js';
import { initCommand } from '../commands/init.js';
import { prdCommand } from '../commands/prd.js';
import { planCommand } from '../commands/plan.js';
import { packCommand } from '../commands/pack.js';
import { auditCommand } from '../commands/audit.js';
import { doctorCommand } from '../commands/doctor.js';

/**
 * Action runtime shared by the guided flow (`start --yes`) and the
 * interactive Conductor loop. Commands keep ownership of their own output.
 */

export interface ActionMeta {
  emoji: string;
  title: string;
  why: string;
  command: string;
}

export const ACTION_META: Record<ActionId, ActionMeta> = {
  init: {
    emoji: '🟢',
    title: 'Inicializar o harness',
    why: 'Spec, constitution, política LGPD, regras de IA, threat model e o hook pre-commit que bloqueia segredos.',
    command: 'npx @vibeharness/cli init',
  },
  prd: {
    emoji: '🟢',
    title: 'Escrever o PRD',
    why: 'A fonte da verdade do produto que sua IA lê antes de codar.',
    command: 'npx @vibeharness/cli prd',
  },
  plan: {
    emoji: '🟢',
    title: 'Planejar e aplicar a stack',
    why: 'Recomendação curada do registry — instala dependências e gera as configs iniciais.',
    command: 'npx @vibeharness/cli plan --apply',
  },
  pack: {
    emoji: '🟡',
    title: 'Empacotar contexto para a IA',
    why: 'Contexto sanitizado (segredos redigidos) pronto para colar no seu assistente.',
    command: 'npx @vibeharness/cli pack',
  },
  audit: {
    emoji: '🔴',
    title: 'Rodar a auditoria de prontidão',
    why: 'Scorecard 0–100 em segurança, LGPD, infra e a11y — com prompts de correção para IA.',
    command: 'npx @vibeharness/cli audit --report',
  },
  doctor: {
    emoji: '🔁',
    title: 'Checagem de manutenção',
    why: 'Runtimes EOL, dependências desatualizadas e setup automático do Dependabot.',
    command: 'npx @vibeharness/cli doctor --fix',
  },
};

export async function runAction(id: ActionId, yes: boolean): Promise<void> {
  switch (id) {
    case 'init':
      await initCommand({ yes });
      break;
    case 'prd':
      await prdCommand({ yes });
      break;
    case 'plan':
      await planCommand({ yes, apply: true });
      break;
    case 'pack':
      await packCommand({});
      break;
    case 'audit':
      // failUnder '0': the guided flow must never be killed by the score
      // gate — the user sees the scorecard and fix prompts, then continues.
      await auditCommand({ report: true, failUnder: '0', yes });
      break;
    case 'doctor':
      await doctorCommand({ fix: true });
      break;
  }
}
