import { masterRulesTemplate } from '../src/generators/rules.js';

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
