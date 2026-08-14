import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../utils/fs.js';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface ProjectState {
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  hasLockfile: boolean;
  packageManager: PackageManager;
  hasGitRepo: boolean;
  /** .vibe/PRD.md */
  hasPrd: boolean;
  /** .vibe/SPEC.md */
  hasSpec: boolean;
  /** .vibe/STACK.md */
  hasStack: boolean;
  /** .vibe/threat-model.json */
  hasThreatModel: boolean;
  /** .vibe/CONTEXT.md */
  hasContext: boolean;
  /** Any generated AI rules file (CLAUDE.md, .cursorrules, …) */
  hasRules: boolean;
  hasDependabot: boolean;
  hasSecurityWorkflow: boolean;
  hasPreCommit: boolean;
  hasAuditReport: boolean;
}

export type Stage = 'idea' | 'starting' | 'building' | 'shipping' | 'production';

export type ActionId = 'init' | 'prd' | 'plan' | 'pack' | 'audit' | 'doctor';

/** Lifecycle order — the spec-driven cycle VibeHarness enforces. */
export const ACTION_LIFECYCLE: ActionId[] = ['init', 'prd', 'plan', 'pack', 'audit', 'doctor'];

export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function detectProjectState(root: string = projectRoot()): Promise<ProjectState> {
  const has = (...segments: string[]) => existsSync(join(root, ...segments));
  return {
    hasPackageJson: has('package.json'),
    hasNodeModules: has('node_modules'),
    hasLockfile:
      has('package-lock.json') || has('pnpm-lock.yaml') || has('yarn.lock') || has('bun.lockb') || has('bun.lock'),
    packageManager: detectPackageManager(root),
    hasGitRepo: has('.git'),
    hasPrd: has('.vibe', 'PRD.md'),
    hasSpec: has('.vibe', 'SPEC.md'),
    hasStack: has('.vibe', 'STACK.md'),
    hasThreatModel: has('.vibe', 'threat-model.json'),
    hasContext: has('.vibe', 'CONTEXT.md'),
    hasRules: has('CLAUDE.md') || has('.cursorrules') || has('.windsurfrules'),
    hasDependabot: has('.github', 'dependabot.yml'),
    hasSecurityWorkflow: has('.github', 'workflows', 'security.yml'),
    hasPreCommit: has('.git', 'hooks', 'pre-commit'),
    hasAuditReport: has('AUDIT_REPORT.md'),
  };
}

export function isActionDone(state: ProjectState, action: ActionId): boolean {
  switch (action) {
    case 'init':
      return state.hasSpec && state.hasRules;
    case 'prd':
      return state.hasPrd;
    case 'plan':
      return state.hasStack;
    case 'pack':
      return state.hasContext;
    case 'audit':
      return state.hasAuditReport;
    case 'doctor':
      return state.hasDependabot;
  }
}

/**
 * Order the actions for a given stage. Pending actions come first (in the
 * stage's priority order), done actions follow in lifecycle order.
 */
export function orderActionsForStage(state: ProjectState, stage: Stage): ActionId[] {
  const pending = (ids: ActionId[]) => ids.filter((id) => !isActionDone(state, id));
  const done = ACTION_LIFECYCLE.filter((id) => isActionDone(state, id));

  let priority: ActionId[];
  switch (stage) {
    case 'idea':
      priority = ['prd', 'init', 'plan', 'pack', 'audit', 'doctor'];
      break;
    case 'starting':
      priority = ['init', 'prd', 'plan', 'pack', 'audit', 'doctor'];
      break;
    case 'building':
      priority = ['init', 'prd', 'plan', 'pack', 'audit', 'doctor'];
      break;
    case 'shipping':
      priority = ['audit', 'pack', 'init', 'prd', 'plan', 'doctor'];
      break;
    case 'production':
      priority = ['doctor', 'audit', 'pack', 'init', 'prd', 'plan'];
      break;
  }
  return [...pending(priority), ...done];
}

/** The single next action to recommend — first pending in stage order, or null when all done. */
export function nextAction(state: ProjectState, stage: Stage): ActionId | null {
  for (const id of orderActionsForStage(state, stage)) {
    if (!isActionDone(state, id)) return id;
  }
  return null;
}

/**
 * Heuristic stage used by `start --yes` (non-interactive): derives a stage
 * from what already exists instead of asking the user.
 */
export function inferStage(state: ProjectState): Stage {
  const anyVibeFile = state.hasPrd || state.hasSpec || state.hasStack;
  if (!anyVibeFile && !state.hasAuditReport) return state.hasPackageJson ? 'starting' : 'idea';
  if (state.hasAuditReport && isActionDone(state, 'init') && state.hasPrd && state.hasStack) return 'shipping';
  return 'building';
}
