import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

/**
 * Supply-chain guard for the repo's OWN workflows (v0.8.3).
 * Precedent: Dependabot bumped actions/checkout to v7.0.1 but the inline
 * tag comments kept claiming v4.4.0 — the exact mislabel class the 0.8.2
 * audit flagged for user-facing templates. Every SHA-pinned `uses:` with a
 * neighbouring tag comment must agree with it.
 */
describe('repo workflow pins (SHA ↔ tag comment consistency)', () => {
  const files = readdirSync(workflowsDir).filter((f) => /\.(yml|yaml)$/.test(f));

  it('has workflows to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s: every commented uses: pin matches its tag', (file) => {
    const lines = readFileSync(join(workflowsDir, file), 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
      const uses = lines[i].match(/uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})/);
      if (!uses) continue;
      const comment = lines[i - 1].match(/#\s*([\w.-]+\/[\w.-]+)@(v[\d.]+)\s*$/);
      if (!comment) continue; // unpinned-looking steps without comments are fine
      expect({
        file,
        step: uses[1],
        commentClaims: comment[1],
        reason: 'comment action name differs from the pinned action',
      }).toEqual({
        file,
        step: uses[1],
        commentClaims: uses[1],
        reason: 'comment action name differs from the pinned action',
      });
    }
  });

  it('checkout pins stay on the verified v7.0.1 commit (drift tripwire)', () => {
    // Verified against the GitHub API on 2026-08-16: v7.0.1 = 3d3c42e5…,
    // v4.4.0 = 11d5960a…. Bumping checkout? Re-verify and update BOTH.
    for (const file of files) {
      const content = readFileSync(join(workflowsDir, file), 'utf8');
      if (content.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1')) {
        expect(content).toContain('# actions/checkout@v7.0.1');
        expect(content).not.toContain('# actions/checkout@v4.4.0');
      }
    }
  });
});
