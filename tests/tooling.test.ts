import { checkSecurityTooling, SECURITY_TOOLS } from '../src/utils/tooling.js';

describe('checkSecurityTooling', () => {
  it('reports every recommended tool as installed when the probe says yes', async () => {
    const results = await checkSecurityTooling(async () => true);
    expect(results).toHaveLength(SECURITY_TOOLS.length);
    expect(results.every((r) => r.installed)).toBe(true);
  });

  it('reports tools as missing when the probe says no', async () => {
    const results = await checkSecurityTooling(async () => false);
    expect(results.every((r) => !r.installed)).toBe(true);
  });

  it('covers gitleaks and osv-scanner with install hints', () => {
    const bins = SECURITY_TOOLS.map((t) => t.bin);
    expect(bins).toEqual(expect.arrayContaining(['gitleaks', 'osv-scanner']));
    for (const tool of SECURITY_TOOLS) {
      expect(tool.install).toBeTruthy();
      expect(tool.purpose).toBeTruthy();
    }
  });
});
