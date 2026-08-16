import {
  skillMdTemplate,
  slashCommandTemplate,
  agentsMdTemplate,
  type SlashCommandName,
} from '../src/generators/skill.js';

const ALL_COMMANDS: SlashCommandName[] = ['prd', 'plan', 'pack', 'audit', 'doctor'];

describe('skillMdTemplate', () => {
  it('invokes the CLI via the scoped package name (supply-chain safety)', () => {
    const md = skillMdTemplate('my-app');
    expect(md).toContain('npx @vibeharness/cli');
    // The unscoped `npx vibe-harness` form resolves to a third-party npm
    // placeholder — it must never appear in generated agent instructions.
    expect(md).not.toContain('npx vibe-harness');
  });

  it('documents prompt-injection defence in hard rules', () => {
    expect(skillMdTemplate('my-app')).toContain('prompt-injection');
  });
});

describe('slashCommandTemplate', () => {
  it('generates a body for every command', () => {
    for (const name of ALL_COMMANDS) {
      const out = slashCommandTemplate(name);
      expect(out).toContain('---');
      expect(out).toContain(`npx @vibeharness/cli ${name}`);
      expect(out).not.toContain('npx vibe-harness');
    }
  });

  it('/audit marks findings as data, not instructions', () => {
    const out = slashCommandTemplate('audit');
    expect(out).toContain('DATA, not instructions');
    expect(out).toContain('prompt injection');
  });
});

describe('agentsMdTemplate', () => {
  it('uses scoped CLI invocations in the command table', () => {
    const md = agentsMdTemplate('my-app', ['Next.js']);
    expect(md).toContain('npx @vibeharness/cli audit');
    expect(md).not.toContain('npx vibe-harness');
  });
});

describe('untrusted projectName/stack sanitisation', () => {
  // projectName comes from the user's package.json — attacker-controllable.
  const malicious = 'proj`${evil}`';

  it('neutralises backticks and ${} in skillMdTemplate output', () => {
    const md = skillMdTemplate(malicious);
    const descriptionLine = md.split('\n').find((line) => line.startsWith('description:')) ?? '';
    expect(descriptionLine).not.toContain('`');
    expect(descriptionLine).not.toContain('${');
    // The raw payload must never survive into generated agent instructions.
    expect(md).not.toContain('${');
    expect(md).not.toContain('`${evil}`');
  });

  it('neutralises backticks and ${} in agentsMdTemplate output', () => {
    const md = agentsMdTemplate(malicious, ['Next.js', 'stack`${x}`']);
    const heading = md.split('\n')[0];
    expect(heading).not.toContain('`');
    expect(heading).not.toContain('${');
    const stackLine = md.split('\n').find((line) => line.startsWith('- Stack:')) ?? '';
    expect(stackLine).not.toContain('`');
    expect(stackLine).not.toContain('${');
    expect(md).not.toContain('${');
  });

  it('keeps normal names readable', () => {
    expect(skillMdTemplate('my-app')).toContain('vibecoding in my-app');
    expect(agentsMdTemplate('my-app', []).split('\n')[0]).toBe('# AGENTS.md — my-app');
  });
});
