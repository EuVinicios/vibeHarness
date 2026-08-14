import { NODE_EOL, nodeEolStatus } from '../src/utils/node-eol.js';
import { dependabotTemplate } from '../src/generators/dependabot.js';

describe('nodeEolStatus', () => {
  const now = new Date('2026-08-14');

  it('flags EOL majors as eol', () => {
    expect(nodeEolStatus(16, now)).toBe('eol');
    expect(nodeEolStatus(18, now)).toBe('eol');
    expect(nodeEolStatus(20, now)).toBe('eol');
  });

  it('keeps supported majors as active', () => {
    expect(nodeEolStatus(22, now)).toBe('active');
    expect(nodeEolStatus(24, now)).toBe('active');
    expect(nodeEolStatus(26, now)).toBe('active');
  });

  it('returns unknown for unmapped majors', () => {
    expect(nodeEolStatus(99, now)).toBe('unknown');
  });

  it('has EOL dates for LTS majors', () => {
    expect(NODE_EOL[20]).toBeDefined();
    expect(NODE_EOL[22]).toBeDefined();
  });
});

describe('dependabotTemplate', () => {
  it('includes npm and github-actions ecosystems by default', () => {
    const yml = dependabotTemplate();
    expect(yml).toContain('version: 2');
    expect(yml).toContain('package-ecosystem: "npm"');
    expect(yml).toContain('package-ecosystem: "github-actions"');
    expect(yml).toContain('interval: "weekly"');
  });

  it('respects a custom ecosystem list', () => {
    const yml = dependabotTemplate(['pip']);
    expect(yml).toContain('package-ecosystem: "pip"');
    expect(yml).not.toContain('package-ecosystem: "npm"');
  });
});
