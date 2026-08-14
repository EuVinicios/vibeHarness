# VibeHarness 🛡️

> **All-in-one production harness for AI-assisted development (vibecoding)**

VibeHarness transforms chaotic AI-driven development into **secure, auditable, LGPD-compliant engineering** through a single CLI that covers the full development lifecycle — before, during, and after coding.

---

## ✨ Features at a Glance

| Phase | Command | What it does |
|-------|---------|--------------|
| 🟢 Before coding | `vibe-harness init` | Generates spec, LGPD policy, AI rules, installs pre-commit hook |
| 🟡 During coding | `vibe-harness pack` | Sanitises context for your AI assistant (removes secrets) |
| 🔴 After coding | `vibe-harness audit` | Runs production-readiness audit with a 0–100 scorecard |

---

## 🚀 Quick Start

```bash
# One-time setup in your project
npx vibe-harness init

# Before prompting your AI — build a clean context file
npx vibe-harness pack

# Before shipping — run the full audit
npx vibe-harness audit --report
```

---

## 🟢 Phase 1 — `vibe-harness init`

Interactive setup that generates everything your project needs:

```
.vibe/
  SPEC.md              ← project specification (business rules, data model, arch)
  CONSTITUTION.md      ← non-negotiable architecture & security laws
  LGPD_POLICY.md       ← LGPD Brazil compliance checklist
  threat-model.json    ← structured threat model (payments, auth, PII)

.cursorrules                         ← Cursor rules
.cursor/rules/vibeharness.mdc        ← Cursor MDC format
CLAUDE.md                            ← Claude Code instructions
.windsurfrules                       ← Windsurf rules
.github/copilot-instructions.md      ← GitHub Copilot instructions
.git/hooks/pre-commit                ← Blocks commits containing API keys
```

AI rules enforce:
- ✅ Schema validation on every `req.body` (Zod / Pydantic — mandatory)
- ✅ No hardcoded secrets — ever
- ✅ Row-Level Security for Supabase / PostgreSQL
- ✅ Parameterised SQL — never string interpolation
- ✅ LGPD/GDPR data-handling rules
- ✅ TDD for critical routes

```bash
vibe-harness init          # Interactive (recommended)
vibe-harness init --yes    # Non-interactive, safe defaults
```

---

## 🟡 Phase 2 — `vibe-harness pack`

Generates a sanitised `.vibe/CONTEXT.md` ready to paste into your AI assistant or attach as agent context. Inspired by [Repomix](https://github.com/yamadashy/repomix).

**What it removes automatically:**
- `.env` files and committed secrets
- `node_modules/`, `dist/`, `build/`, `.next/`
- Binary files (images, fonts, archives)
- Lines matching secret patterns (keys are replaced with `[REDACTED]`)

**What it adds:**
- Architecture summary from `.vibe/SPEC.md` and `.vibe/CONSTITUTION.md`
- Formatted source with language-tagged code blocks

```bash
vibe-harness pack                                # Output → .vibe/CONTEXT.md
vibe-harness pack --output context.md           # Custom output path
vibe-harness pack --include-tests               # Include test files
vibe-harness pack --exclude "e2e/**,fixtures/**" # Extra exclusions
```

---

## 🔴 Phase 3 — `vibe-harness audit`

Runs a comprehensive local audit and generates a **Commercial Readiness Scorecard (0–100)**:

| Section | Max | What it checks |
|---------|-----|----------------|
| 🛡️ Security & Secrets | 30 | Exposed keys, .gitignore for .env |
| 📦 Dependency CVEs | 10 | `npm audit` high/critical CVEs |
| 🇧🇷 LGPD Brasil Compliance | 20 | PII in logs, DSR endpoints, consent banner, RLS, password hashing |
| 🧹 Dead Code & Hygiene | 10 | God objects, console.logs, knip suggestion |
| 🗄️ Database Integrity | 10 | Versioned migrations vs `db push` |
| 🏗️ Infra & Resilience | 10 | Health endpoints, rate limiting, error handlers |
| ♿ Accessibility (WCAG) | 10 | Missing alt attrs, unlabelled buttons/inputs |

```bash
vibe-harness audit                    # Terminal scorecard only
vibe-harness audit --report           # + AUDIT_REPORT.md with AI fix prompts
vibe-harness audit --fail-under 80    # Exit code 1 if score < 80
```

### AUDIT_REPORT.md
Each finding includes an **AI Fix Prompt** you can paste directly into Cursor, Claude, or Copilot to fix the issue. A Batch AI Fix Prompt at the end covers all critical/high findings in one shot.

---

## 🇧🇷 LGPD Brasil Compliance Module

The dedicated LGPD scanner checks:

1. **PII in Logs** — CPF, e-mail, phone, passwords in `console.log` / `print`
2. **Cookie Consent** — detects CookieYes, OneTrust, Cookiebot, or custom banners
3. **Required Pages** — `/politica-de-privacidade` and `/termos-de-uso`
4. **DSR Endpoints** — account deletion (`DELETE /api/user`) and data export
5. **Row-Level Security** — RLS policies for Supabase / PostgreSQL
6. **Secure Password Hashing** — blocks MD5/SHA1, enforces bcrypt/Argon2

---

## 🤖 CI/CD Integration

VibeHarness ships with `.github/workflows/vibe-gate.yml` that:
1. Runs the full audit on every Pull Request
2. Blocks merge if score is below 70
3. Posts the AUDIT_REPORT.md as a PR comment (updated on re-runs)

---

## 🏗️ Repository Structure

```
src/
├── cli.ts                    ← CLI entry point (commander)
├── commands/
│   ├── init.ts               ← Phase 1: spec, LGPD policy, AI rules, pre-commit hook
│   ├── pack.ts               ← Phase 2: context packager command
│   ├── audit.ts              ← Phase 3: TUI scorecard + report
│   └── rules.ts              ← Standalone AI rules generator
├── core/
│   ├── orchestrator.ts       ← Runs all scanners, calculates aggregate score
│   └── types.ts              ← Shared TypeScript types (Finding, AuditReport…)
├── scanners/
│   ├── security.ts           ← Secrets & CVE scanning
│   ├── lgpd.ts               ← 🇧🇷 LGPD Brasil compliance scanner
│   ├── deadcode.ts           ← Dead code & hygiene
│   ├── database.ts           ← Migration & schema integrity
│   ├── infra.ts              ← Health endpoints, rate limiting, CI
│   └── accessibility.ts      ← WCAG 2.1 heuristic checks
├── generators/
│   ├── rules.ts              ← Master AI rules template
│   ├── spec.ts               ← SPEC.md & CONSTITUTION.md templates
│   └── lgpd-policy.ts        ← LGPD_POLICY.md template
├── packager/
│   └── index.ts              ← Context packager engine (Repomix-inspired)
├── ui/
│   ├── tui.ts                ← Terminal scorecard rendering
│   └── report.ts             ← AUDIT_REPORT.md generator with AI fix prompts
└── utils/
    └── fs.ts                 ← File helpers, stack detection

tests/
├── templates.test.ts         ← Generator template tests
├── audit.test.ts             ← Core audit engine tests
├── lgpd.test.ts              ← LGPD scanner tests
└── packager.test.ts          ← Context packager tests
```

---

## 🛠️ Development

```bash
npm install
npm run build    # Compile TypeScript → dist/
npm test         # Run 23 tests across 4 suites
```

---

## 📦 Key Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI argument parsing |
| `enquirer` | Interactive prompts |
| `chalk` | Terminal colouring |
| `ora` | Spinner / progress |
| `fast-glob` | File scanning |

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
