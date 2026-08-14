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
