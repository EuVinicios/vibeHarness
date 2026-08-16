/**
 * Template for the security workflow installed into USER projects by
 * `vibe-harness init` — secret scanning (gitleaks), dependency CVE audit
 * (npm audit) and the VibeHarness audit gate.
 *
 * All third-party actions are pinned by full commit SHA (supply-chain
 * hardening) — bump them deliberately, never by floating tag. The SHAs below
 * are verified against their tags (see tests/security-workflow.test.ts, which
 * fails loud if they drift); the vibe-harness CLI itself is pinned to the
 * version generating the file, so a compromised `latest` on npm cannot
 * execute in user CI.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeInline } from '../ui/report.js';

// actions/checkout@v4.4.0 (verified against the GitHub API)
export const CHECKOUT_SHA = '11d5960a326750d5838078e36cf38b85af677262';
// actions/setup-node@v4.4.0 (verified against the GitHub API)
export const SETUP_NODE_SHA = '49933ea5288caeca8642d1e84afbd3f7d6820020';
// gitleaks/gitleaks-action@v2.3.9 (verified against the GitHub API)
export const GITLEAKS_SHA = 'ff98106e4c7b2bc287b24eaf42907196329070c7';

/** Version of the CLI generating the template — pins the audit step in CI. */
function readOwnVersion(): string | null {
  try {
    const raw = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
      'utf8'
    );
    const version = (JSON.parse(raw) as { version?: string }).version;
    return typeof version === 'string' && version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

export function securityWorkflowTemplate(projectName: string): string {
  const name = sanitizeInline(projectName, 80);
  const version = readOwnVersion();
  if (!version) {
    // Fail loud instead of emitting an unpinned `npx --yes @vibeharness/cli`:
    // a floating latest in user CI is the exact supply-chain hole this
    // template exists to prevent.
    throw new Error('Cannot determine the CLI version — refusing to generate a workflow with an unpinned audit step');
  }
  const cliSpec = `@vibeharness/cli@${version}`;
  return `# Security gate for ${name} — installed by vibe-harness.
# Secret scanning (gitleaks) + dependency CVEs (npm audit) + audit score gate.
# Actions are pinned by commit SHA on purpose — update them deliberately.
name: Security

on:
  pull_request:
  push:
    branches: [main, master]

permissions:
  contents: read
  # gitleaks-action posts a findings comment on the PR — without this it
  # fails with "Resource not accessible by integration" (noise, not a leak).
  pull-requests: write

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
        # --yes: npx must not prompt in CI (a prompt stalls or fails the job).
        # The package is version-pinned: a compromised npm \`latest\` must not
        # get code execution in this pipeline.
        run: npx --yes ${cliSpec} audit --fail-under 70
`;
}
