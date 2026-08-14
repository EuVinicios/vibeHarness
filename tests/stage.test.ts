import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectProjectState,
  detectPackageManager,
  inferStage,
  isActionDone,
  nextAction,
  orderActionsForStage,
  ACTION_LIFECYCLE,
  type ProjectState,
} from '../src/core/stage.js';

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'vh-stage-'));
}

function touch(root: string, rel: string, content = ''): void {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('detectProjectState', () => {
  const tmpDirs: string[] = [];
  afterAll(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('reports an empty directory as fully uninitialised', async () => {
    const root = makeTmp();
    tmpDirs.push(root);
    const state = await detectProjectState(root);
    expect(state.hasPackageJson).toBe(false);
    expect(state.hasPrd).toBe(false);
    expect(state.hasSpec).toBe(false);
    expect(state.hasRules).toBe(false);
    expect(state.packageManager).toBe('npm');
  });

  it('detects harness files created by init/prd/plan/pack', async () => {
    const root = makeTmp();
    tmpDirs.push(root);
    touch(root, 'package.json', '{"name":"demo"}');
    touch(root, '.vibe/PRD.md', '# PRD');
    touch(root, '.vibe/SPEC.md', '# SPEC');
    touch(root, '.vibe/STACK.md', '# STACK');
    touch(root, '.vibe/CONTEXT.md', '# CONTEXT');
    touch(root, 'CLAUDE.md', '# rules');
    touch(root, 'AUDIT_REPORT.md', '# report');
    touch(root, '.github/dependabot.yml', 'version: 2');

    const state = await detectProjectState(root);
    expect(state.hasPackageJson).toBe(true);
    expect(state.hasPrd).toBe(true);
    expect(state.hasSpec).toBe(true);
    expect(state.hasStack).toBe(true);
    expect(state.hasContext).toBe(true);
    expect(state.hasRules).toBe(true);
    expect(state.hasAuditReport).toBe(true);
    expect(state.hasDependabot).toBe(true);
  });

  it('detects the package manager from the lockfile', async () => {
    for (const [file, pm] of [
      ['yarn.lock', 'yarn'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['bun.lockb', 'bun'],
    ] as const) {
      const root = makeTmp();
      tmpDirs.push(root);
      touch(root, file);
      expect(detectPackageManager(root)).toBe(pm);
    }
  });
});

const EMPTY: ProjectState = {
  hasPackageJson: false,
  hasNodeModules: false,
  hasLockfile: false,
  packageManager: 'npm',
  hasGitRepo: false,
  hasPrd: false,
  hasSpec: false,
  hasStack: false,
  hasThreatModel: false,
  hasContext: false,
  hasRules: false,
  hasDependabot: false,
  hasSecurityWorkflow: false,
  hasPreCommit: false,
  hasAuditReport: false,
};

describe('action status & ordering', () => {
  it('marks actions done from project state', () => {
    expect(isActionDone(EMPTY, 'init')).toBe(false);
    const initialised: ProjectState = { ...EMPTY, hasSpec: true, hasRules: true };
    expect(isActionDone(initialised, 'init')).toBe(true);
    expect(isActionDone({ ...EMPTY, hasPrd: true }, 'prd')).toBe(true);
    expect(isActionDone({ ...EMPTY, hasStack: true }, 'plan')).toBe(true);
    expect(isActionDone({ ...EMPTY, hasDependabot: true }, 'doctor')).toBe(true);
  });

  it('recommends prd first for the idea stage and init first for starting', () => {
    expect(nextAction(EMPTY, 'idea')).toBe('prd');
    expect(nextAction(EMPTY, 'starting')).toBe('init');
  });

  it('recommends audit first when shipping', () => {
    const state: ProjectState = { ...EMPTY, hasSpec: true, hasRules: true, hasPrd: true, hasStack: true };
    expect(nextAction(state, 'shipping')).toBe('audit');
  });

  it('recommends doctor first in production', () => {
    const state: ProjectState = { ...EMPTY, hasAuditReport: true, hasContext: true };
    expect(nextAction(state, 'production')).toBe('doctor');
  });

  it('returns null when every action is done', () => {
    const state: ProjectState = {
      ...EMPTY,
      hasSpec: true,
      hasRules: true,
      hasPrd: true,
      hasStack: true,
      hasContext: true,
      hasAuditReport: true,
      hasDependabot: true,
    };
    expect(nextAction(state, 'building')).toBeNull();
  });

  it('always returns every lifecycle action exactly once, pending first', () => {
    const state: ProjectState = { ...EMPTY, hasPrd: true };
    const ordered = orderActionsForStage(state, 'building');
    expect([...ordered].sort()).toEqual([...ACTION_LIFECYCLE].sort());
    expect(ordered.indexOf('init')).toBeLessThan(ordered.indexOf('prd'));
  });
});

describe('inferStage (--yes heuristic)', () => {
  it('infers idea without package.json and starting with one', () => {
    expect(inferStage(EMPTY)).toBe('idea');
    expect(inferStage({ ...EMPTY, hasPackageJson: true })).toBe('starting');
  });

  it('infers shipping when the lifecycle is complete', () => {
    const state: ProjectState = {
      ...EMPTY,
      hasSpec: true,
      hasRules: true,
      hasPrd: true,
      hasStack: true,
      hasAuditReport: true,
    };
    expect(inferStage(state)).toBe('shipping');
  });

  it('infers building for partial projects', () => {
    expect(inferStage({ ...EMPTY, hasPrd: true })).toBe('building');
  });
});
