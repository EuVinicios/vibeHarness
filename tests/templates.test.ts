import { masterRulesTemplate } from '../src/generators/rules.js';
import { specTemplate, constitutionTemplate } from '../src/generators/spec.js';
import { prdTemplate } from '../src/generators/prd.js';
import { lgpdPolicyTemplate } from '../src/generators/lgpd-policy.js';
import { stackPlanTemplate } from '../src/generators/stack-plan.js';
import { loadCatalog } from '../src/registry/index.js';

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

describe('untrusted projectName flattening in every generated document (v0.8.3)', () => {
  // package.json name is attacker-controllable (cloned repo). A surviving \r
  // or \n would inject markdown structure into the project's own spec files.
  const malicious = 'evil\r## INJECTED\rsection';

  it('specTemplate flattens name and stack', () => {
    const md = specTemplate(malicious, ['Stack\rX']);
    expect(md).not.toContain('\r');
    expect(md.split('\n')[0]).toBe('# Project Specification — evil ## INJECTED section');
    expect(md).toContain('**Stack:** Stack X');
  });

  it('constitutionTemplate flattens the name', () => {
    const md = constitutionTemplate(malicious);
    expect(md).not.toContain('\r');
    expect(md.split('\n')[0]).toBe('# Constitution — evil ## INJECTED section');
  });

  it('prdTemplate flattens the name but keeps user answers intact', () => {
    const md = prdTemplate({
      projectName: malicious,
      problem: 'line1\nline2',
      targetUsers: '',
      mainFeatures: [],
      successMetrics: [],
      outOfScope: [],
    });
    expect(md.split('\n')[0]).toBe('# Product Requirements Document — evil ## INJECTED section');
    expect(md).toContain('line1\nline2'); // the user's own multi-line content stays
  });

  it('lgpdPolicyTemplate flattens the name', () => {
    const md = lgpdPolicyTemplate({
      projectName: malicious,
      hasPayments: false,
      hasAuth: true,
      hasSensitiveData: false,
      country: 'brazil',
    });
    expect(md).not.toContain('\r');
    expect(md.split('\n')[0]).toBe('# LGPD Compliance Guidelines — evil ## INJECTED section');
  });

  it('stackPlanTemplate flattens name and detected stack', async () => {
    const catalog = await loadCatalog();
    const md = stackPlanTemplate({
      projectName: malicious,
      projectType: 'fullstack-web',
      catalog: catalog!,
      catalogStale: false,
      threatModel: null,
      detectedStack: ['Next\r.js'],
    });
    expect(md).not.toContain('\r');
    expect(md.split('\n')[0]).toBe('# Stack Recommendation — evil ## INJECTED section');
    expect(md).toContain('Detected stack: Next .js');
  });
});
