import { masterRulesTemplate } from '../src/generators/rules.js';
import { specTemplate, constitutionTemplate } from '../src/generators/spec.js';

describe('masterRulesTemplate', () => {
  it('includes project name in output', () => {
    const result = masterRulesTemplate({
      projectName: 'test-app',
      stack: ['Next.js', 'Supabase'],
      hasPayments: false,
      hasAuth: true,
      hasSensitiveData: false,
      usesSupabase: true,
    });
    expect(result).toContain('test-app');
  });

  it('includes ABSOLUTE PROHIBITIONS section', () => {
    const result = masterRulesTemplate({
      projectName: 'test-app',
      stack: [],
      hasPayments: false,
      hasAuth: false,
      hasSensitiveData: false,
      usesSupabase: false,
    });
    expect(result).toContain('ABSOLUTE PROHIBITIONS');
  });

  it('includes payment rules when hasPayments is true', () => {
    const result = masterRulesTemplate({
      projectName: 'shop',
      stack: ['Next.js', 'Stripe'],
      hasPayments: true,
      hasAuth: false,
      hasSensitiveData: false,
      usesSupabase: false,
    });
    expect(result).toContain('PAYMENT RULES');
    expect(result).toContain('Stripe webhook');
  });

  it('omits payment rules when hasPayments is false', () => {
    const result = masterRulesTemplate({
      projectName: 'blog',
      stack: [],
      hasPayments: false,
      hasAuth: false,
      hasSensitiveData: false,
      usesSupabase: false,
    });
    expect(result).not.toContain('PAYMENT RULES');
  });

  it('includes Supabase rules when usesSupabase is true', () => {
    const result = masterRulesTemplate({
      projectName: 'app',
      stack: ['Supabase'],
      hasPayments: false,
      hasAuth: false,
      hasSensitiveData: false,
      usesSupabase: true,
    });
    expect(result).toContain('Row-Level Security');
  });

  it('includes LGPD/GDPR rules when hasSensitiveData is true', () => {
    const result = masterRulesTemplate({
      projectName: 'app',
      stack: [],
      hasPayments: false,
      hasAuth: false,
      hasSensitiveData: true,
      usesSupabase: false,
    });
    expect(result).toContain('LGPD');
  });
});

describe('specTemplate', () => {
  it('includes project name and stack', () => {
    const result = specTemplate('my-app', ['Next.js', 'Prisma']);
    expect(result).toContain('my-app');
    expect(result).toContain('Next.js, Prisma');
  });
});

describe('constitutionTemplate', () => {
  it('contains security laws', () => {
    const result = constitutionTemplate('my-app');
    expect(result).toContain('Security First');
    expect(result).toContain('Migrations, Not Magic');
  });
});
