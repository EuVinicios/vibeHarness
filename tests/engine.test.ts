import { conductorLoop, cockpitLines, orientationText, type ConductorDeps } from '../src/conductor/engine.js';
import type { ProjectState, Stage } from '../src/core/stage.js';
import type { AuditReport, AuditSectionResult, Finding } from '../src/core/types.js';
import { buildFixPrompt, buildPrompt } from '../src/conductor/prompt-builder.js';

const emptyState: ProjectState = {
  hasPackageJson: true,
  hasNodeModules: true,
  hasLockfile: true,
  packageManager: 'npm',
  hasGitRepo: true,
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

function section(score: number, findings: Finding[] = []): AuditSectionResult {
  return { score, maxScore: 10, findings };
}

function makeReport(withCritical: boolean): AuditReport {
  const crit: Finding[] = withCritical
    ? [{ severity: 'critical', category: 'security', message: 'Hardcoded token', file: 'src/a.ts', fix: 'Move to env var' }]
    : [];
  return {
    totalScore: withCritical ? 55 : 95,
    maxScore: 70,
    grade: withCritical ? 'D' : 'A',
    sections: {
      security: section(5, crit),
      dependencies: section(10),
      lgpd: section(10),
      deadcode: section(10),
      database: section(10),
      infra: section(5),
      accessibility: section(5),
    },
  };
}

function makeDeps(keys: string[], overrides: Partial<ConductorDeps> = {}): ConductorDeps {
  const queue = [...keys];
  const deps: ConductorDeps = {
    forceInteractive: true,
    detectState: async () => emptyState,
    inferStageFn: () => 'starting' as Stage,
    projectNameFn: async () => 'Meu-SaaS',
    runAuditFn: async () => makeReport(false),
    readCache: async () => ({ score: 85, max: 100, grade: 'B' }),
    writeCache: async () => undefined,
    loadLaws: async () => ['Law 1 — Security First'],
    log: () => undefined,
    clear: () => undefined,
    waitKey: async () => {
      const k = queue.shift();
      if (k === undefined) throw new Error('waitKey called with an empty key queue');
      return k;
    },
    copy: async () => ({ ok: true, method: 'pbcopy' as const }),
    runActionFn: async () => undefined,
  };
  return { ...deps, ...overrides };
}

describe('conductorLoop', () => {
  it('returns false when not interactive', async () => {
    const result = await conductorLoop({ forceInteractive: false });
    expect(result).toBe(false);
  });

  it('renders the cockpit and exits cleanly on Q', async () => {
    const logs: string[] = [];
    const deps = makeDeps(['q'], { log: (s) => logs.push(s) });
    const result = await conductorLoop(deps);
    expect(result).toBe(true);
    const out = logs.join('\n');
    expect(out).toContain('VIBEHARNESS · Production Conductor');
    expect(out).toContain('Meu-SaaS');
    expect(out).toContain('STARTING');
    expect(out).toContain('Onde você está');
    expect(out).toContain('Prompt pronto');
    expect(out).toContain('[Q]');
  });

  it('Enter copies the surgical prompt for the next action', async () => {
    const copied: string[] = [];
    const deps = makeDeps(['enter', 'enter', 'q'], {
      copy: async (text) => {
        copied.push(text);
        return { ok: true, method: 'pbcopy' };
      },
    });
    await conductorLoop(deps);
    expect(copied).toHaveLength(1);
    const expected = buildPrompt(
      { action: 'init', projectName: 'Meu-SaaS', stage: 'starting', state: emptyState },
      ['Law 1 — Security First']
    );
    expect(copied[0]).toBe(expected);
  });

  it('V with a clean audit celebrates and refreshes the cache', async () => {
    const logs: string[] = [];
    const caches: { score: number; max: number; grade: string }[] = [];
    // Emulate the real cache module: reads return the last written snapshot.
    let stored: { score: number; max: number; grade: string } | null = {
      score: 85,
      max: 100,
      grade: 'B',
    };
    const deps = makeDeps(['v', 'q'], {
      log: (s) => logs.push(s),
      readCache: async () => stored,
      runAuditFn: async () => makeReport(false),
      writeCache: async (score, max, grade) => {
        stored = { score, max, grade };
        caches.push({ score, max, grade });
      },
    });
    await conductorLoop(deps);
    expect(caches).toEqual([{ score: 95, max: 70, grade: 'A' }]);
    expect(logs.join('\n')).toContain('Validação limpa');
  });

  it('V with critical findings switches Enter to the fix prompt', async () => {
    const copied: string[] = [];
    const logs: string[] = [];
    const deps = makeDeps(['v', 'enter', 'enter', 'q'], {
      log: (s) => logs.push(s),
      runAuditFn: async () => makeReport(true),
      copy: async (text) => {
        copied.push(text);
        return { ok: true, method: 'pbcopy' };
      },
    });
    await conductorLoop(deps);
    const out = logs.join('\n');
    expect(out).toContain('Hardcoded token');
    expect(out).toContain('Prompt de CORREÇÃO pronto');
    expect(copied).toHaveLength(1);
    const expected = buildFixPrompt(
      [{ severity: 'critical', category: 'security', message: 'Hardcoded token', file: 'src/a.ts', fix: 'Move to env var' }],
      'Meu-SaaS'
    );
    expect(copied[0]).toBe(expected);
  });

  it('N runs the recommended next action and re-evaluates state', async () => {
    const actions: string[] = [];
    const logs: string[] = [];
    let callCount = 0;
    const deps = makeDeps(['n', 'q'], {
      log: (s) => logs.push(s),
      runActionFn: async (id: unknown) => {
        actions.push(id as string);
      },
      // First detection: nothing initialised. After N: init done → next is prd.
      detectState: async () => {
        callCount++;
        if (callCount <= 1) return emptyState;
        return { ...emptyState, hasSpec: true, hasRules: true };
      },
    });
    await conductorLoop(deps);
    expect(actions).toEqual(['init']);
    expect(logs.join('\n')).toContain('Escrever o PRD');
  });

  it('keeps the loop stable when nothing is pending', async () => {
    const logs: string[] = [];
    const done: ProjectState = {
      ...emptyState,
      hasPrd: true,
      hasSpec: true,
      hasStack: true,
      hasContext: true,
      hasRules: true,
      hasDependabot: true,
      hasAuditReport: true,
    };
    const deps = makeDeps(['q'], {
      log: (s) => logs.push(s),
      detectState: async () => done,
    });
    await conductorLoop(deps);
    const out = logs.join('\n');
    expect(out).toContain('Ciclo completo');
  });
});

describe('cockpitLines', () => {
  it('shows project, stage and score with grade', () => {
    const lines = cockpitLines({
      projectName: 'Meu-SaaS',
      version: '0.5.1',
      stage: 'building',
      score: { score: 85, max: 100, grade: 'B' },
    });
    const joined = lines.join('\n');
    expect(joined).toContain('Meu-SaaS');
    expect(joined).toContain('BUILDING');
    expect(joined).toContain('85/100');
    expect(joined).toContain('[B]');
  });

  it('shows a hint when no score exists yet', () => {
    const lines = cockpitLines({
      projectName: 'x',
      version: '0.0.0',
      stage: 'idea',
      score: null,
    });
    expect(lines.join('\n')).toContain('tecle V');
  });
});

describe('orientationText', () => {
  it('explains where the project is and the next goal in friendly terms', () => {
    const text = orientationText('starting', emptyState, 'init');
    expect(text).toContain('primeiros passos');
    expect(text).toContain('Inicializar o harness');
  });

  it('celebrates completion when nothing is pending', () => {
    const done: ProjectState = {
      ...emptyState,
      hasPrd: true,
      hasSpec: true,
      hasStack: true,
      hasContext: true,
      hasRules: true,
      hasDependabot: true,
      hasAuditReport: true,
    };
    const text = orientationText('production', done, null);
    expect(text).toContain('6/6');
  });
});
