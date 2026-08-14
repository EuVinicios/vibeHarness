# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | ✅ latest minor only |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please use GitHub's **private vulnerability reporting**:

1. Go to the [Security tab](https://github.com/EuVinicios/vibeHarness/security) of the repository.
2. Click **"Report a vulnerability"**.
3. Describe the issue, reproduction steps, and potential impact.

Alternatively, contact the maintainer via the email listed on their GitHub profile.

### What to expect

- **Acknowledgement** within 48 hours.
- **Status update** within 7 days with a triage decision.
- **Coordinated disclosure** — we will agree on a disclosure timeline before anything goes public.
- Credit in the release notes, unless you prefer to remain anonymous.

## Scope

In scope:

- The `vibe-harness` CLI source code (`src/`).
- Generated artefacts that could introduce vulnerabilities into user projects (templates, hooks, workflows).
- Supply-chain issues in this repository's own dependencies.

Out of scope:

- Vulnerabilities in projects that *use* VibeHarness (report them to the respective project).
- Social engineering or physical attacks.

## Security Considerations When Using VibeHarness

- **Prompt injection:** audit findings embed untrusted data (file names, code content).
  Reports sanitise every field and mark AI fix prompts as *data*, but treat any
  instruction-looking text inside findings with suspicion.
- `vibe-harness pack` redacts known secret patterns and excludes key material, but
  redaction is **best-effort** — review `.vibe/CONTEXT.md` before sharing it with
  any AI service.
- The pre-commit hook uses `gitleaks` when installed (full 150+ rule set) and a
  critical-pattern grep fallback. It is a safety net, not a substitute for secret
  scanning in CI — `init` installs one (`.github/workflows/security.yml`), and you
  should also enable GitHub secret scanning + push protection.
- Generated AI rules are guidance, not enforcement — keep your own CI gates.
- Only install the CLI via the scoped name: `npx @vibeharness/cli`. The unscoped
  `vibe-harness` npm package belongs to an unrelated third party.

## Supply-chain posture (this repository)

- All GitHub Actions are pinned by full commit SHA; updates arrive via Dependabot PRs.
- Dependabot covers the `npm` and `github-actions` ecosystems.
- CodeQL analyses every PR and push (`.github/workflows/codeql.yml`).
- Releases are published from CI with **npm provenance attestations** (OIDC) —
  verify via the provenance badge on npm.
- The weekly registry sync validates catalog entries against the curation criteria
  (license allowlist, min stars, activity) and surfaces violations as CI warnings
  and step-summary output for mandatory human review before merge.
