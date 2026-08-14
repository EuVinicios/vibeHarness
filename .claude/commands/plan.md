---
description: Generate the curated stack recommendation (.vibe/STACK.md) via vibe-harness
---

Run `npx @vibeharness/cli plan --apply` at the project root (use `--type <fullstack-web|api|landing|saas>` if the user already stated the project type; drop `--apply` if the user only wants the recommendation).
With `--apply` the CLI installs the recommended dependencies and generates initial configs + starters under `.vibe/starters/` — it never edits `src/`.
Then review `.vibe/STACK.md` with the user and copy the accepted decisions into `.vibe/SPEC.md` section 4.
