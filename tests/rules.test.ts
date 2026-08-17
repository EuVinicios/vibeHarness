import { masterRulesTemplate, claudeMdTemplate, wrapVibeHarnessBlock, mergeRulesContent } from '../src/generators/rules.js';

describe('masterRulesTemplate — constitution laws (minimal input)', () => {
  const rules = masterRulesTemplate({
    projectName: 'demo',
    stack: [],
    hasPayments: false,
    hasAuth: false,
    hasSensitiveData: false,
    usesSupabase: false,
  });

  it('includes the accessibility law (WCAG 2.1 AA)', () => {
    expect(rules).toContain('ACCESSIBILITY');
    expect(rules).toContain('WCAG');
    expect(rules).toContain('4.5:1');
    expect(rules).toContain('keyboard');
  });

  it('requires ≥ 80% branch coverage on critical flows', () => {
    expect(rules).toContain('80');
    expect(rules).toContain('branch coverage');
    expect(rules).toContain('data-deletion');
  });

  it('gates new dependencies on justification, CVE check and existing-package review', () => {
    expect(rules).toContain('justification');
    expect(rules).toContain('npm audit');
    expect(rules).toContain('typo');
  });

  it('adds an accessibility item to the PR checklist', () => {
    expect(rules).toContain('Accessibility verified');
  });
});

describe('masterRulesTemplate — conditional sections (regression)', () => {
  const rules = masterRulesTemplate({
    projectName: 'demo',
    stack: ['Next.js', 'Supabase'],
    hasPayments: true,
    hasAuth: true,
    hasSensitiveData: true,
    usesSupabase: true,
  });

  it('keeps the payment rules section', () => {
    expect(rules).toContain('PAYMENT RULES');
    expect(rules).toContain('Stripe');
  });

  it('keeps the authentication rules section', () => {
    expect(rules).toContain('AUTHENTICATION RULES');
  });

  it('keeps the Supabase rules section', () => {
    expect(rules).toContain('SUPABASE RULES');
    expect(rules).toContain('Row-Level Security');
  });

  it('keeps the data-privacy (LGPD/GDPR) section', () => {
    expect(rules).toContain('DATA PRIVACY');
    expect(rules).toContain('LGPD');
  });
});

describe('masterRulesTemplate — untrusted name/stack flattening (v0.8.3)', () => {
  it('flattens \\n and \\r in projectName and stack entries', () => {
    const rules = masterRulesTemplate({
      projectName: 'evil\r## INJECTED\rheading',
      stack: ['Next\r.js', 'bad\n- item'],
      hasPayments: false,
      hasAuth: false,
      hasSensitiveData: false,
      usesSupabase: false,
    });
    expect(rules).not.toContain('\r');
    expect(rules.split('\n')[0]).toBe('# VibeHarness AI Rules — evil ## INJECTED heading');
    const stackLine = rules.split('\n').find((l) => l.startsWith('- Stack:')) ?? '';
    expect(stackLine).toBe('- Stack: Next .js, bad - item');
  });

  it('claudeMdTemplate keeps a CR payload on the heading line', () => {
    const md = claudeMdTemplate('BODY', 'evil\rinjected: true');
    expect(md).not.toContain('\r');
    expect(md.split('\n')[0]).toBe('# CLAUDE.md — AI Instructions for evil injected: true');
  });
});

describe('mergeRulesContent — intelligent rules injection', () => {
  it('wraps new rules in start and end markers', () => {
    const wrapped = wrapVibeHarnessBlock('test rules');
    expect(wrapped).toContain('<!-- vibe-harness:start -->');
    expect(wrapped).toContain('test rules');
    expect(wrapped).toContain('<!-- vibe-harness:end -->');
  });

  it('appends wrapped rules to existing content without clobbering user rules', () => {
    const existing = '# User Custom Rules\n- Rule 1\n- Rule 2';
    const merged = mergeRulesContent(existing, '# Vibe Rules');
    expect(merged).toContain('# User Custom Rules\n- Rule 1\n- Rule 2');
    expect(merged).toContain('<!-- vibe-harness:start -->');
    expect(merged).toContain('# Vibe Rules');
    expect(merged).toContain('<!-- vibe-harness:end -->');
  });

  it('replaces only the vibe-harness block when markers already exist', () => {
    const existing = '# Header\n\n<!-- vibe-harness:start -->\n# Old Vibe Rules\n<!-- vibe-harness:end -->\n\n# Footer';
    const merged = mergeRulesContent(existing, '# Updated Vibe Rules');
    expect(merged).toContain('# Header');
    expect(merged).toContain('# Footer');
    expect(merged).toContain('# Updated Vibe Rules');
    expect(merged).not.toContain('# Old Vibe Rules');
  });
});
