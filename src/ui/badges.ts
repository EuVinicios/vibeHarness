import chalk from 'chalk';
import { colors } from './theme.js';
import type { Finding } from '../core/types.js';

/**
 * Badges — boxed severity labels, grade pills and score bars shared by the
 * Conductor cockpit and the audit scorecard.
 */

export function severityBadge(severity: Finding['severity'] | string): string {
  switch (severity) {
    case 'critical': return colors.crit(' CRIT ');
    case 'high':     return colors.danger(' HIGH ');
    case 'medium':   return colors.warn(' WARN ');
    case 'low':      return colors.accent(' LOW  ');
    default:         return colors.dim(' INFO ');
  }
}

export function gradePill(grade: string): string {
  switch (grade) {
    case 'A': return colors.success(`[${grade}]`);
    case 'B': return colors.primary(`[${grade}]`);
    case 'C': return colors.warn(`[${grade}]`);
    case 'D': return colors.danger(`[${grade}]`);
    default: return colors.crit(`[${grade}]`);
  }
}

export function scoreBar(score: number, max: number, width = 20): string {
  const ratio = max > 0 ? score / max : 0;
  const filled = Math.round(ratio * width);
  const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
  const color = ratio >= 0.7 ? chalk.green : ratio >= 0.5 ? chalk.yellow : chalk.red;
  return color(bar);
}
