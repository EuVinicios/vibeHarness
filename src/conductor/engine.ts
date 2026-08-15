import chalk from 'chalk';
import {
  detectProjectState,
  inferStage,
  isActionDone,
  nextAction,
  type ActionId,
  type ProjectState,
  type Stage,
} from '../core/stage.js';
import { runAudit } from '../core/orchestrator.js';
import type { AuditReport, Finding } from '../core/types.js';
import { getProjectName } from '../utils/fs.js';
import { printReport } from '../ui/tui.js';
import { colors, icons, stageChip, gradeChip, scoreChip, supportsFancyRender } from '../ui/theme.js';
import { box, footer } from '../ui/box.js';
import { ACTION_META, runAction } from './actions.js';
import { buildPrompt, buildFixPrompt, loadConstitutionLaws } from './prompt-builder.js';
import { copyToClipboard, type ClipboardResult } from './clipboard.js';
import { awaitKey } from './keys.js';
import { readFreshScoreCache, writeScoreCache } from './score-cache.js';

/**
 * The Conductor — a closed interactive loop (Qwen/Antigravity-inspired):
 *   render cockpit → wait for a single key → act → re-render.
 *   [Enter] copy surgical prompt · [V] validate instantly ·
 *   [A] full audit · [N] run next step · [Q] quit.
 *
 * All side-effecting collaborators are injectable for testing.
 */

export interface ConductorDeps {
  detectState?: () => Promise<ProjectState>;
  inferStageFn?: (state: ProjectState) => Stage;
  projectNameFn?: () => Promise<string>;
  runAuditFn?: () => Promise<AuditReport>;
  runActionFn?: (id: ActionId, yes: boolean) => Promise<void>;
  waitKey?: (keys: string[]) => Promise<string>;
  copy?: (text: string) => Promise<ClipboardResult>;
  log?: (line: string) => void;
  clear?: () => void;
  readCache?: () => Promise<{ score: number; max: number; grade: string } | null>;
  writeCache?: (score: number, max: number, grade: string) => Promise<void>;
  loadLaws?: () => Promise<string[]>;
  /** Force interactive behaviour in tests. */
  forceInteractive?: boolean;
}

const KEYS = ['enter', 'v', 'a', 'n', 'q'] as const;
type ConductorKey = (typeof KEYS)[number];

function isInteractive(deps: ConductorDeps): boolean {
  return deps.forceInteractive ?? process.stdin.isTTY === true;
}

/** Two friendly sentences: where the project is + what the next goal is. */
export function orientationText(stage: Stage, state: ProjectState, next: ActionId | null): string {
  const doneCount = (['init', 'prd', 'plan', 'pack', 'audit', 'doctor'] as ActionId[]).filter((id) =>
    isActionDone(state, id)
  ).length;

  const where: Record<Stage, string> = {
    idea: 'Seu projeto ainda é uma 💡 ideia — e está tudo bem, todo grande produto começa assim.',
    starting: 'Projeto dando os primeiros passos 🏗️ — hora de solidificar a fundação antes de acelerar.',
    building: 'Código fluindo 💻 — o harness agora foca em defesa e qualidade contínua.',
    shipping: 'Reta final 🚀 — o foco total é prontidão comercial e zero surpresas em produção.',
    production: 'Projeto no ar 🛠️ — modo manutenção: frescor de dependências e vigilância de segurança.',
  };

  if (!next) {
    return `${where[stage]} As ${doneCount}/6 etapas do ciclo estão concluídas — rode \`vibe-harness audit\` sempre que quiser revalidar a prontidão.`;
  }
  const meta = ACTION_META[next];
  return `${where[stage]} A próxima meta é ${colors.warn(meta.title)} ${meta.emoji} — ${meta.why}`;
}

/** Assemble the cockpit header/status lines (exported for snapshot tests). */
export function cockpitLines(input: {
  projectName: string;
  version: string;
  stage: Stage;
  score: { score: number; max: number; grade: string } | null;
}): string[] {
  const scoreText = input.score
    ? `${scoreChip(input.score.score, input.score.max)} ${gradeChip(input.score.grade)}`
    : colors.dim('Score: —  (tecle V para medir)');
  return [
    `${icons.shield}  VIBEHARNESS · Production Conductor ${colors.dim(`v${input.version}`)}`,
    `${icons.package} Projeto: ${colors.text(input.projectName)}  ${colors.dim('│')}  Fase: ${stageChip(input.stage)}  ${colors.dim('│')}  ${scoreText}`,
  ];
}

function promptPreviewLines(prompt: string): string[] {
  const lines = prompt.split('\n');
  const head = lines.slice(0, 6);
  const rest = lines.length - head.length;
  return [
    ...head.map((l) => (l.trim() === '' ? ' ' : l)),
    colors.dim(`… (+${rest} linhas — Enter copia o prompt completo)`),
  ];
}

/** Tiny celebration animation (skipped when NO_COLOR / non-TTY). */
async function celebrate(log: (s: string) => void): Promise<void> {
  if (!supportsFancyRender()) {
    log(colors.success('  ✅  Validação limpa — score atualizado!'));
    return;
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠇'];
  for (const f of frames) {
    log(colors.success(`\r  ${f} ✨ Validação limpa — score atualizado!`));
    await new Promise((r) => setTimeout(r, 60));
  }
  log('\n');
}

function criticalFindings(report: AuditReport): Finding[] {
  return Object.values(report.sections)
    .flatMap((s) => s.findings)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');
}

type ScoreSnapshot = { score: number; max: number; grade: string };
type ReadCache = () => Promise<ScoreSnapshot | null>;
type WriteCache = (score: number, max: number, grade: string) => Promise<void>;

async function resolveScore(
  deps: ConductorDeps,
  log: (s: string) => void,
  readCache: ReadCache,
  writeCache: WriteCache
): Promise<ScoreSnapshot | null> {
  const cached = await readCache();
  if (cached) return { score: cached.score, max: cached.max, grade: cached.grade };

  log(colors.dim('  ⏳  Medindo score de prontidão (só na primeira abertura)…'));
  try {
    const report = await (deps.runAuditFn ?? runAudit)();
    await writeCache(report.totalScore, report.maxScore, report.grade);
    return { score: report.totalScore, max: report.maxScore, grade: report.grade };
  } catch {
    log(colors.warn('  ⚠  Não foi possível medir o score agora — siga com o fluxo normalmente.'));
    return null;
  }
}

function printFindingsWithCare(findings: Finding[], log: (s: string) => void): void {
  log('');
  log(colors.warn(`  👾  Encontrei ${findings.length} ponto(s) que merecem atenção — calma, é normal!`));
  log(colors.dim('      Cada um abaixo já tem correção mapeada; o prompt de correção está pronto (Enter).'));
  for (const f of findings.slice(0, 8)) {
    const loc = f.file ? colors.dim(` (${f.file})`) : '';
    log(`      ${f.severity.toUpperCase().padEnd(8)} ${f.message}${loc}`);
  }
  if (findings.length > 8) {
    log(colors.dim(`      … e mais ${findings.length - 8} — o prompt de correção cobre todos.`));
  }
  log('');
}

/** The interactive Conductor loop. Falls back silently when non-TTY. */
export async function conductorLoop(deps: ConductorDeps = {}): Promise<boolean> {
  const log = deps.log ?? ((s: string) => console.log(s));
  const clear = deps.clear ?? (() => console.clear());
  const waitKey = deps.waitKey ?? awaitKey;
  const copy = deps.copy ?? copyToClipboard;
  const readCache = deps.readCache ?? readFreshScoreCache;
  const writeCache = deps.writeCache ?? writeScoreCache;
  const loadLawsFn = deps.loadLaws ?? loadConstitutionLaws;

  if (!isInteractive(deps)) return false;

  const detect = deps.detectState ?? detectProjectState;
  const stageOf = deps.inferStageFn ?? inferStage;
  const nameOf = deps.projectNameFn ?? getProjectName;

  let laws = await loadLawsFn();
  let fixFindings: Finding[] | null = null;

  while (true) {
    const state = await detect();
    const stage = stageOf(state);
    const next = nextAction(state, stage);
    const projectName = await nameOf();
    const score = await resolveScore(deps, log, readCache, writeCache);

    clear();
    log('');

    // ── Cockpit header ────────────────────────────────────────────────
    log(box(cockpitLines({ projectName, version: await discoverVersion(), stage, score }), { color: chalk.cyan }));
    log('');

    // ── 🧭 Orientation card ───────────────────────────────────────────
    log(box([orientationText(stage, state, next)], { title: `${icons.compass} Onde você está`, color: chalk.cyanBright }));
    log('');

    // ── 📋 Prompt card ────────────────────────────────────────────────
    if (fixFindings && fixFindings.length > 0) {
      log(box(
        [
          `${icons.bug} Prompt de CORREÇÃO pronto — ${fixFindings.length} finding(s) mapeado(s).`,
          colors.dim('Cole no seu assistente de IA, aplique as correções e volte para validar com [V].'),
        ],
        { title: `${icons.clipboard} Prompt pronto`, color: chalk.yellow }
      ));
    } else if (next) {
      const prompt = buildPrompt({ action: next, projectName, stage, state }, laws);
      log(box(promptPreviewLines(prompt), { title: `${icons.clipboard} Prompt pronto · ${ACTION_META[next].title}`, color: chalk.cyanBright }));
    } else {
      log(box(
        [`${icons.trophy} Ciclo completo! Use [V] para revalidar ou [A] para o scorecard completo.`],
        { title: `${icons.clipboard} Prompt pronto`, color: chalk.green }
      ));
    }

    log('');
    log(footer([
      ['↵ Enter', `${icons.clipboard} ${fixFindings?.length ? 'Copiar Prompt de Correção' : 'Copiar Prompt'}`],
      ['V', `${icons.bolt} Validar Código`],
      ['A', `${icons.chart} Ver Auditoria`],
      ['N', '▶️ Executar Próxima Etapa'],
      ['Q', `${icons.exit} Sair`],
    ]));
    log('');

    const key = (await waitKey([...KEYS])) as ConductorKey;

    if (key === 'q') {
      log(colors.dim('\n  Até logo! O harness continua de onde paramos na próxima. 🛡️\n'));
      return true;
    }

    if (key === 'enter') {
      let text: string;
      if (fixFindings && fixFindings.length > 0) {
        text = buildFixPrompt(fixFindings, projectName);
      } else if (next) {
        text = buildPrompt({ action: next, projectName, stage, state }, laws);
      } else {
        text = `${icons.trophy} VibeHarness: ciclo completo — rode uma auditoria final para confirmar a prontidão.`;
      }
      const result = await copy(text);
      if (result.ok) {
        log(colors.success(`\n  ✔  Prompt copiado (${result.method})! Cole no seu assistente de IA.`));
      } else {
        log(colors.warn(`\n  ⚠  Clipboard indisponível — prompt salvo em ${result.path}`));
      }
      log(colors.dim('     Após a IA gerar o código, volte e tecle V para validar.\n'));
      await waitKey(['enter']);
      continue;
    }

    if (key === 'v') {
      log('');
      log(colors.dim('  ⚡  Validando código localmente…'));
      let report: AuditReport;
      try {
        report = await (deps.runAuditFn ?? runAudit)();
      } catch {
        log(colors.warn('  ⚠  Validação falhou por erro inesperado — tente `vibe-harness audit`.'));
        await waitKey(['enter']);
        continue;
      }
      await writeCache(report.totalScore, report.maxScore, report.grade);
      const crits = criticalFindings(report);
      if (crits.length === 0) {
        fixFindings = null;
        await celebrate(log);
      } else {
        fixFindings = crits;
        printFindingsWithCare(crits, log);
      }
      continue;
    }

    if (key === 'a') {
      log('');
      let report: AuditReport;
      try {
        report = await (deps.runAuditFn ?? runAudit)();
      } catch {
        log(colors.warn('  ⚠  Auditoria falhou por erro inesperado — tente `vibe-harness audit`.'));
        await waitKey(['enter']);
        continue;
      }
      await writeCache(report.totalScore, report.maxScore, report.grade);
      printReport(report);
      await waitKey(['enter']);
      continue;
    }

    if (key === 'n') {
      if (!next) {
        log(colors.success('\n  🏆  Nada pendente — todas as etapas do ciclo estão concluídas!\n'));
        await waitKey(['enter']);
        continue;
      }
      log('');
      log(colors.accent(`\n  ▶️  Executando: ${ACTION_META[next].title} ${colors.dim(`(${ACTION_META[next].command})`)}\n`));
      await (deps.runActionFn ?? runAction)(next, false);
      laws = await loadLawsFn(); // init may have (re)written the constitution
      fixFindings = null;
      log(colors.success('\n  ✅  Etapa concluída — reavaliando o estado do projeto…\n'));
      continue;
    }
  }
}

let cachedVersion: string | null = null;
async function discoverVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const pkgRaw = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
      'utf8'
    );
    cachedVersion = (JSON.parse(pkgRaw) as { version?: string }).version ?? '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}
