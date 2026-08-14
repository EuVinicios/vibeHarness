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

- `vibe-harness pack` redacts known secret patterns, but **review `.vibe/CONTEXT.md` before sharing it** with any AI service.
- The pre-commit hook is a safety net, not a substitute for secret scanning in CI (enable GitHub secret scanning on your repos).
- Generated AI rules are guidance, not enforcement — keep your own CI gates.
