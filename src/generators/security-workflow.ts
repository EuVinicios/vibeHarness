/**
 * Template for the security workflow installed into USER projects by
 * `vibe-harness init` — secret scanning (gitleaks), dependency CVE audit
 * (npm audit + osv-scanner) and the VibeHarness audit gate.
 *
 * All third-party actions are pinned by full commit SHA (supply-chain
 * hardening) — bump them deliberately, never by floating tag.
 */

// actions/checkout@v4.4.0
const CHECKOUT_SHA = '11d5960a326750d5838078e36cf38b85af677262';
// actions/setup-node@v4.4.0
const SETUP_NODE_SHA = '820762786026740c76f36085b0efc47a31fe5020';
// gitleaks/gitleaks-action@v2.3.9
const GITLEAKS_SHA = 'ff98106e4c7b2bc287b24eaf42907196329070c7';

export function securityWorkflowTemplate(projectName: string): string {
  return `# Security gate for ${projectName} — installed by vibe-harness.
# Secret scanning (gitleaks) + dependency CVEs (npm audit, osv-scanner) + audit score gate.
# Actions are pinned by commit SHA on purpose — update them deliberately.
name: Security

on:
  pull_request:
  push:
    branches: [main, master]

permissions:
  contents: read

jobs:
  secrets:
    name: 🙈 Secret scanning (gitleaks)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@${CHECKOUT_SHA}
        with:
          fetch-depth: 0
      - name: gitleaks
        uses: gitleaks/gitleaks-action@${GITLEAKS_SHA}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

  dependencies:
    name: 📦 Dependency CVE audit
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@${CHECKOUT_SHA}
      - name: npm audit (fail on high/critical)
        run: |
          if [ ! -f package.json ]; then
            echo "No package.json — skipping npm audit."
            exit 0
          fi
          npm audit --audit-level=high

  vibe-audit:
    name: 🛡️ VibeHarness audit (score ≥ 70)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@${CHECKOUT_SHA}
      - name: Setup Node.js
        uses: actions/setup-node@${SETUP_NODE_SHA}
        with:
          node-version: '20'
      - name: Run VibeHarness audit
        # --yes: npx must not prompt in CI (a prompt stalls or fails the job)
        run: npx --yes @vibeharness/cli audit --fail-under 70
`;
}
