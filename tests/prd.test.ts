import { prdTemplate } from '../src/generators/prd.js';

describe('prdTemplate', () => {
  it('includes project name and core sections', () => {
    const result = prdTemplate({
      projectName: 'test-app',
      problem: 'Manual audits are slow',
      targetUsers: 'Solo vibecoders',
      mainFeatures: [],
      successMetrics: [],
      outOfScope: [],
    });
    expect(result).toContain('Product Requirements Document — test-app');
    expect(result).toContain('Problem Statement');
    expect(result).toContain('Manual audits are slow');
    expect(result).toContain('Target Users');
    expect(result).toContain('User Stories');
    expect(result).toContain('Definition of Done');
  });

  it('renders provided features, metrics and out-of-scope items', () => {
    const result = prdTemplate({
      projectName: 'shop',
      problem: '',
      targetUsers: '',
      mainFeatures: ['Checkout with PIX', 'Order tracking'],
      successMetrics: ['Activation ≥ 30%'],
      outOfScope: ['Native mobile apps'],
    });
    expect(result).toContain('- [ ] Checkout with PIX');
    expect(result).toContain('- [ ] Order tracking');
    expect(result).toContain('- [ ] Activation ≥ 30%');
    expect(result).toContain('- [ ] Native mobile apps');
  });

  it('renders placeholders when inputs are empty', () => {
    const result = prdTemplate({
      projectName: 'empty',
      problem: '',
      targetUsers: '',
      mainFeatures: [],
      successMetrics: [],
      outOfScope: [],
    });
    expect(result).toContain('Describe feature 1');
    expect(result).toContain('Define a measurable metric');
  });
});
