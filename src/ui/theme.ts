import chalk from 'chalk';

/**
 * VibeHarness design system — single source of truth for colors, icons and
 * status chips across the TUI (Qwen/Antigravity-inspired).
 *
 * Palette:
 *  - cyan / electric blue → headers & navigation
 *  - emerald              → success, ready items (✔)
 *  - amber                → recommended actions (★) and warnings
 *  - coral red            → critical vulnerabilities (CRIT)
 *  - dim gray             → commands and detail text
 */

export const colors = {
  primary: chalk.bold.cyanBright,
  accent: chalk.bold.blueBright,
  success: chalk.bold.green,
  warn: chalk.bold.yellow,
  danger: chalk.bold.red,
  crit: chalk.bgRed.white.bold,
  dim: chalk.dim,
  text: chalk.white,
} as const;

export const icons = {
  shield: '🛡️',
  compass: '🧭',
  target: '🎯',
  idea: '💡',
  coding: '💻',
  rocket: '🚀',
  bug: '👾',
  bolt: '⚡',
  clipboard: '📋',
  trophy: '🏆',
  lgpd: '🇧🇷',
  package: '📦',
  broom: '🧹',
  db: '🗄️',
  infra: '🏗️',
  a11y: '♿',
  check: '✔',
  star: '★',
  exit: '🚪',
  chart: '📊',
  sparkles: '✨',
} as const;

export type Stage = 'idea' | 'starting' | 'building' | 'shipping' | 'production';

const STAGE_META: Record<Stage, { emoji: string; label: string }> = {
  idea: { emoji: '💡', label: 'IDEA' },
  starting: { emoji: '🏗️', label: 'STARTING' },
  building: { emoji: '💻', label: 'BUILDING' },
  shipping: { emoji: '🚀', label: 'SHIPPING' },
  production: { emoji: '🛠️', label: 'PRODUCTION' },
};

export function stageChip(stage: Stage): string {
  const meta = STAGE_META[stage] ?? STAGE_META.idea;
  return colors.accent(`${meta.emoji} ${meta.label}`);
}

/** `[B]`-style grade pill, emerald (A) → coral (F). */
export function gradeChip(grade: string): string {
  switch (grade) {
    case 'A': return colors.success(`[${grade}]`);
    case 'B': return colors.primary(`[${grade}]`);
    case 'C': return colors.warn(`[${grade}]`);
    case 'D': return colors.danger(`[${grade}]`);
    default: return colors.crit(`[${grade}]`);
  }
}

/** Score chip like `85/100 🏆` with color reflecting readiness. */
export function scoreChip(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  const color = pct >= 0.8 ? colors.success : pct >= 0.6 ? colors.warn : colors.danger;
  return color(`${score}/${max} ${icons.trophy}`);
}

/** True when the environment supports colors — used to gate animations. */
export function supportsFancyRender(): boolean {
  return process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
}
