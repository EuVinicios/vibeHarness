# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.2] - 2026-08-16 — "Auditoria integral de pré-lançamento: segurança do installer, supply chain e acurácia dos scanners"

Resposta à auditoria externa de pré-lançamento (veredito CONDITIONAL GO, 9
achados altos). Todos os achados altos e médios foram corrigidos; suíte cresceu
de 192 para 278 testes (24 → 29 suites), lint e knip agora rodam no CI.

### Fixed — installer (perda de dados do usuário)
- **P0 — `install` sobrescrevia as regras do usuário sem opt-in.** Agora segue
  a política unificada de escrita: skip-if-exists por padrão, `--force` no CLI
  e parâmetro `force` no tool MCP `vibe_install` para sobrescrever.
- **P0 — config de cliente com JSON inválido era destruída silenciosamente**
  (`readJsonIfExists` → `{}` → overwrite, inclusive a config GLOBAL do
  Windsurf). Agora o merge falha alto por cliente, sem escrever nada, e configs
  válidas recebem backup `.vibe-bak` antes do merge.
- Escrita atômica (tmp + rename) e recusa de escrita através de symlinks em
  `writeFileSafe` (um `.mcp.json -> ~/.profile` plantado no repo não alcança
  mais o alvo).
- Falha em um cliente não aborta os demais (try/catch por cliente; `errors` no
  resultado da ação).
- opencode: se o projeto usa `opencode.jsonc`, o merge acontece nele — sem
  criar `opencode.json` que sombrearia a config existente.

### Fixed — supply chain dos artefatos gerados
- **P0 — SHA do setup-node nos workflows apontava para commit não-release**
  com comentário alegando v4.4.0. Repinado para o SHA real da tag
  (`49933ea…`, verificado na GitHub API) nos workflows do repo E no template
  `security.yml` gerado nos projetos dos usuários; teste
  `tests/security-workflow.test.ts` trava os três SHAs contra as tags
  verificadas (drift falha alto).
- **P0 — CI gerado rodava `npx --yes @vibeharness/cli` sem versão.** Agora o
  template fixa `@vibeharness/cli@<versão geradora>` — comprometimento do
  `latest` no npm não vira execução no CI do usuário.
- **`.mcp.json` gerado era JSON inválido** (comentários `//`) e usava
  `npx -y` sem pin. Agora é JSON estrito, servidores pinados
  (`server-filesystem@2026.7.10`, `server-memory@2026.7.4`) e o
  `server-fetch` foi removido (pacote não existe mais no npm — isca de
  typosquat).
- `projectName`/stack (inputs do package.json e threat-model, não confiáveis)
  sanitizados nos templates de workflow, rules e skill — sem injeção de YAML
  via quebra de comentário.
- Starters Drizzle/Stripe trocam assertions `!` por throw explícito; starter
  Playwright deixa de transformar env var em comando shell.

### Fixed — acurácia dos scanners
- **LGPD**: regex de telefone exigia marcador BR/separadores (timestamps e IDs
  param de pontuar como PII); CPF em 11 dígitos só pontua com checksum válido
  (Receita Federal); guarda do `INSERT…password` reescrita (o lookahead
  negativo após `.*` era vacuous e nunca excluía inserts com hash; placeholder
  `?` agora coberto); f-strings/`.format()`/`%s` Python triados como dinâmicos;
  código comentado não conta (logs, consentimento, páginas de privacidade);
  `gtag` deixa de satisfazer consentimento; DSR reconhece `axios.delete`,
  `fetch(…, { method: 'DELETE' })`, Next.js App Router (`export function
  DELETE` em `app/**/route.ts`) e `GET /api/user/export`; MD5/SHA1 rebaixado a
  HIGH com mensagem neutra (Gravatar/ETag são usos legítimos).
- **Infra**: gating de superfície web espelhando o LGPD (CLIs não pontuam mais
  0/10); health aceita sub-rotas (`/api/health`, `/health/live|ready`);
  comentários não suprimem findings; `onError` só conta em arquivo com
  marcador de backend; respeita `.vibe/auditignore`.
- **Acessibilidade**: `id=` só conta como label com `<label for>` no mesmo
  arquivo; `title` deixa de ser label aceitável; `<Image>` (next/image)
  verificado; respeita `.vibe/auditignore`.
- **Banco**: penalidade dupla removida (`db push` + sem migrations = 1
  finding); detecta `drizzle-kit push` e varre workflows/Dockerfile; diretório
  `drizzle` só conta se for diretório; TypeORM/Sequelize/Kysely/Knex cobertos.
- **Segurança**: heurísticas Express/helmet e session/CSRF ignoram arquivos de
  teste (fixtures não são o app real).

### Changed
- **apply**: Vitest é o primary de testing (Lei 5 pede unit/integração — a
  ordenação por estrelas escolhia Playwright E2E) com Playwright complementar;
  CVE check pós-instalação (`<pm> audit`, Lei 6) com advisories nas notes;
  audit trail do STACK.md limitado a 5 entradas; guarda de path trata `\`
  como separador (Windows).
- **plan**: o confirm interativo acontece DEPOIS de exibir o plano real
  (itens + skips); exit code 1 em falha também no modo interativo.
- **doctor**: npm ausente não é mais "all up to date" (warn guiando
  instalação); git ausente tem mensagem própria.
- Registries (`catalog.json`, `clients.json`) validados com Zod no load,
  incluindo recusa de paths com `..` nos adaptadores de cliente.
- `score-cache` valida o payload de `sections` campo a campo (input de repo
  clonado); prompt de starters do `status` sanitizado contra injection.
- Regras de IA geradas agora cobrem as 7 leis completas: acessibilidade
  (WCAG 2.1 AA), testes críticos (≥ 80% branch coverage) e governança de
  dependências adicionadas ao template + checklist de PR.

### Ops
- `npm run lint` e `npm run knip` adicionados ao CI (estavam vermelhos na
  main desde o PR #35 sem que ninguém percebesse); `site/` nos ignores.
- Testes: 278 (29 suites) — novos: `security-workflow.test.ts`,
  `rules.test.ts`, `accessibility.test.ts`, `infra.test.ts`,
  `database.test.ts` + regressões em `lgpd`, `install`, `apply`.
- Self-audit: 88/100 · MCP `vibe_status` ~95 ms (p95 ≤ 2 s) · 0 CVEs.

## [0.8.1] - 2026-08-15 — "MCP online em todo lugar + hardening de segurança"

### Fixed
- **P0 — servidor MCP aparecia offline no Qwen Code e no Antigravity.** Causa
  raiz dupla, comprovada por reprodução:
  1. `npx -y @vibeharness/cli mcp` sai com exit `127` quando executado dentro de
     um projeto cujo `package.json` se declara `@vibeharness/cli` (o `npm exec`
     resolve o nome contra o projeto local, cujo bin não está linkado em
     `node_modules/.bin`). Clientes MCP fazem spawn com cwd = raiz do projeto,
     então o próprio repo do harness nunca conectava. O `install` agora detecta
     self-install e registra o build local (`node ./dist/cli.js mcp`); o
     `.mcp.json` do repo usa a mesma forma.
  2. O adaptador Antigravity escrevia em `.mcp.json` — arquivo que o
     Antigravity IDE **não lê**. Agora escreve em `.agents/mcp_config.json`
     (path de projeto documentado em antigravity.google/docs/ide/mcp/).
- **P1 — injeção de shell no `doctor`**: as chamadas `gh api` usavam `exec()`
  com owner/repo/branch interpolados — input controlado por quem controla o
  remote clonado ou o repositório no GitHub (branch default com `$()` passa nas
  regras de ref do git). Agora: `execFile()` (argv, sem shell) + charset estrito
  (`trustedGithubSlug`). `commandExists`, `npm audit` e `npm outdated` migrados
  para o mesmo padrão.
- **Falso-negativo silencioso no audit de dependências**: projetos pnpm/yarn/bun
  pontuavam 10/10 sem findings porque só `npm audit` rodava (e falhava sem
  package-lock). O audit agora segue o package manager do projeto e, quando não
  consegue auditar, emite finding `info` explícito em vez de silêncio.
- `serverInfo.version` no handshake MCP agora vem do `package.json` (o 0.8.0
  reportava "0.7.0" — string hardcoded).
- Checado de `.env` no `.gitignore` agora é por linha: um comentário citando
  `.env` contava como proteção.

### Added
- Padrões de secret: AWS STS (`ASIA…`), Hugging Face (`hf_…`), chave privada de
  service account GCP (`"private_key"` em JSON) e URIs MySQL com credenciais
  (mesma triagem de Mongo/Postgres).
- `install` pré-aquece o cache do npx para a primeira conexão MCP não pagar o
  download frio (que pode estourar o timeout de spawn do cliente) e inclui nota
  de verificação pós-restart.
- Teste de regressão do handshake stdio: spawn do binário compilado com assert
  de JSON-RPC puro no stdout — o ponto cego que deixou o P0 passar.

### Changed
- Packager confina a saída de `pack --output` / `vibe_pack` ao projeto (input
  pode vir de agente de IA via MCP).

## [0.8.0] - 2026-08-15 — "Triage: menos ruído, mais sinal"

Refinamentos nascidos de uma auditoria real (dogfooding num SaaS de verdade:
score 32 → 79, 24 criticals que eram em maioria falsos positivos).

### Added
- **Triagem de achados** (`Finding.triage`): classificadores `real`, `fixture`,
  `env-reference`, `ci-ephemeral` e `static-message` rebaixam a severidade do que é
  sabidamente benigno — **sem nunca ocultar** um achado.
  - Referência a variável de ambiente (`API_KEY="$VAR"`) → `info`.
  - Placeholder óbvio (`'server-secret'`, `'test-key'`) → `low`.
  - URI de banco local/CI (`postgres:postgres@localhost`) → `low`.
  - Palavra sensível em mensagem estática de log (sem dado interpolado) → `info`.
- **Stack já resolvida**: `plan`/`plan --apply` detectam capacidades que o projeto já
  resolve (Supabase Auth, Stripe/Asaas, Vercel/Netlify/Fly…) e **param de recomendar
  substitutos conflitantes**; o `.vibe/STACK.md` declara o que foi pulado e por quê.
- **Score por seção** no cache de auditoria, visível em `status` e `status --json`.
- **DSR além de HTTP**: o scanner LGPD reconhece `supabase.rpc('delete_own_account')` /
  `export_user_data` e funções SQL equivalentes como evidência de exclusão/exportação.
- **Página "Ferramentas validadas"** (`docs/ferramentas-validadas.md`), gerada por
  `npm run docs:tools`: declara tudo que o CLI roda, o que o `--apply` instala e o que
  é só recomendação.

### Changed
- PII em logs agora exige **dado dinâmico** (interpolado ou identificador) para pontuar
  como `high`; mensagens estáticas são triadas e resumidas num único achado `info`.
- Scoring de segurança diferencia `low` (−2) e `info` (−0) de `medium` (−5).

## [0.7.1] - 2026-08-15 — "Install fixes: interactive prompt + multi-client"

### Fixed
- **Interactive prompts were broken in the published package** — the ESM build
  imported `prompt` as a named export of the CJS `enquirer` module, which Node
  cannot detect (`prompt is not a function`), so every questionnaire fell
  through to the skip path. Resolved via default-export interop in `ui/prompt.ts`
  (the single enquirer surface).

### Added
- **Multi-client install** — most vibecoders use more than one AI client:
  `install all`, `install cursor,opencode` (comma-separated), and a
  "Todos os detectados" option in the interactive selection when several
  clients are detected.
- When the interactive selection is skipped (non-TTY), the CLI now lists the
  detected clients and every available client id instead of leaving the user
  stranded.

## [0.7.0] - 2026-08-15 — "AI-native: your AI client is the UI"

The interface inverts: instead of teaching the vibecoder a terminal workflow, the
**AI client orchestrates the harness** through MCP tools and only comes to the
human for decisions. One command installs everything; the rest is conversation.

### Added
- **`vibe-harness install [client]`** — one-command setup for your AI client:
  writes the client rules file, merges the vibe-harness MCP server into the
  client config (never clobbering existing servers) and installs extras
  (skills/slash commands). Supported: Claude Code, Cursor, opencode, VS Code
  Copilot, Windsurf, Antigravity (beta), Qwen Code (beta). Adapters are
  declarative data in `registry/clients.json` — adding a client is a JSON
  entry, not code.
- **`vibe-harness mcp`** — stdio MCP server exposing 9 tools: `vibe_status`,
  `vibe_init`, `vibe_prd`, `vibe_plan`, `vibe_pack`, `vibe_audit`,
  `vibe_doctor`, `vibe_rules`, `vibe_install`. Tool descriptions embed the
  lifecycle so any model can orchestrate it; questionnaires return as
  `pendingQuestions` for the AI to ask in chat; audit returns findings +
  sanitized batch fix prompt so the AI fixes its own findings.
- **Headless action layer** (`src/actions/*`): every lifecycle step is now a
  pure `run(opts) → ActionResult` (data + `pendingQuestions` + `nextStep` +
  `outputs`). Commands are thin renderers; `--json` on every command for
  agents and CI.
- **`vibe-harness status`** (new default command) — non-interactive panel:
  stage, lifecycle progress, cached score, pending starter wiring and a
  ready-to-paste AI prompt.
- **Starters wiring loop** — `plan --apply` writes `.vibe/starters/README.md`
  with per-starter checkboxes; `status`/`vibe_status` show the checklist and
  a wiring prompt until every step is done (closes the "review and wire" gap).
- **Unified write policy** — generated files skip-if-exists everywhere;
  `--force` to overwrite (previously `rules` silently overwrote).
- New deps: `@modelcontextprotocol/sdk`, `zod`.

### Changed
- `start` is **deprecated** (kept for one release with a notice) — the guided
  terminal flow remains for terminal-only users.
- Doctor output is data-driven (`DoctorCheck[]`); audit refreshes the score
  cache; `buildBatchFixPrompt` extracted from the report generator and reused
  by the MCP audit tool.
- Skill/AGENTS.md/slash-command templates updated for the MCP-first workflow
  (`/status`, `/install` added).

### Removed
- Interactive Conductor cockpit (v0.6.0): `conductor/engine.ts`, `keys.ts`,
  `clipboard.ts` and the single-key loop. The `ora` dependency is gone.

### Migration notes
- `vibe-harness` with no args now shows the status panel instead of the
  cockpit. `vibe-harness start` still works (deprecated).
- AI clients: re-run `npx @vibeharness/cli install` to register the MCP
  server and refresh rules/skills.

## [0.6.0] - 2026-08-14 — "The Interactive Conductor"

VibeHarness becomes a **zero-key production conductor**: running `vibe-harness`
with no arguments now opens an interactive cockpit (Qwen/Antigravity-inspired)
that guides the full lifecycle — surgical AI prompts on the clipboard, instant
local validation and an educational, gamified feedback loop. **Zero new
dependencies.**

### Added
- **Interactive Conductor** (`vibe-harness` / `start`, default command): a
  closed loop that renders the project cockpit (project · stage · readiness
  score + grade), explains in two friendly sentences where the project is and
  what the next goal is, and reacts to single keys — `↵ Enter` copies the
  surgical prompt to the clipboard, `V` validates instantly with the local
  scanners, `A` opens the full audit scorecard, `N` runs the next lifecycle
  step, `Q` quits. Failed validations switch `Enter` to a fix prompt covering
  every critical/high finding; clean passes trigger the success celebration
  and raise the cached score. Non-TTY environments fall back to the guided
  flow automatically.
- **Terminal design system** (`src/ui/`): rounded UTF-8 boxes (`╭─╮ ╰─╯`) with
  emoji-aware width measurement (variation selectors, ZWJ sequences and
  regional-indicator flags counted correctly; ANSI-safe hard wrapping keeps
  borders aligned), a shared palette (cyan/electric-blue headers, emerald
  success, amber recommendations, coral `CRIT`, dim details), status chips
  (stage, score, grade A–F) and severity badges.
- **Surgical prompt builder** (`src/conductor/prompt-builder.ts`): per-action
  AI prompts embedding mission, acceptance criteria, the Constitution laws
  parsed from `.vibe/CONSTITUTION.md` and pointers to PRD/SPEC/STACK/threat
  model — all untrusted content sanitised through the existing anti
  prompt-injection pipeline.
- **Zero-dependency clipboard** (`src/conductor/clipboard.ts`): `pbcopy` /
  `wl-copy` / `xclip` / `xsel` / `clip` with a `.vibe/prompt-last.txt`
  file fallback — never throws, no new packages (Constitution Law 6).
- **Readiness score cache** (`.vibe/.audit-cache.json`): the cockpit header
  shows the latest score without re-running the full audit on every render;
  `V` refreshes it. Entries expire after 24h.
- **Guided flow translated to pt-BR** for consistency with the Conductor's
  educational layer (LGPD-first audience).

### Changed
- `start` is now the default command: `vibe-harness` with no arguments opens
  the Conductor on a TTY (help text otherwise unchanged).
- All command banners and the audit/pack summaries render through the new
  design system (same content, rounded cards).

### Preserved
- Every Phase 1–4 capability, command signature and generated artifact is
  intact — the Conductor orchestrates them; it replaces nothing. Legacy
  output surfaces keep their semantics for scripts and CI.
- Self-audit after the refactor: **100/100 (Grade A)**, no critical findings;
  164 tests green (up from 156), lint, typecheck and knip clean.

## [0.5.1] - 2026-08-14 — "Dogfooding hardening"

VibeHarness audited itself with its own CLI (score went 97 → **100/100**) and every
false positive found in the process was fixed in the product, not silenced locally.

### Fixed
- **LGPD scoring bug**: informational findings (e.g. "no web surface — web-only
  checks skipped", which is N/A for CLIs) deducted 1 point from the score. Info
  findings are now advisory-only — 0 deduction, matching the dead-code scanner's
  scoring. CLI/library projects no longer cap at 19/20.
- **`pack` false-positive redactions**: the generic secret fallback now skips
  known-safe values — pinned git commit SHAs (CI action pins, integrity hashes),
  shell command substitutions (`$(mktemp)`), regex alternation lists of secret
  *prefixes* (`sk_live_|ghp_…`), and the `[REDACTED by vibe-harness]` marker
  itself. Curated high-precision patterns (sk_live_…, AKIA…, ghp_…) are
  unaffected and still always redact. Self-packing VibeHarness went from 5 false
  redactions to 0.
- **`doctor` false "unknown" status on Node 26**: EOL table now covers Node 26
  (EOL 2029-04-30).
- **`npm run lint` was broken**: ESLint was referenced by the script but neither
  installed nor configured. The repo now ships `eslint.config.js` (flat config,
  typescript-eslint recommended, `no-console` off for the CLI where stdout is
  the interface) with ESLint 10 + @eslint/js + globals as devDependencies.

### Added
- **`init --force`**: overwrite already-generated files, for consistency with
  `prd --force` / `plan --force` (default remains skip-existing, never clobber).
- **Pre-commit hook honours `.vibe/auditignore`**: the grep fallback now skips
  allow-listed files (glob patterns, `#` comments), matching what the audit
  scanners already do. Found by dogfooding — the hook blocked commits to the
  very files that define the detection patterns and to test fixtures with
  intentional fake secrets.
- **`security.yml` template hardening**: the generated vibe-audit job now sets
  up Node.js (SHA-pinned setup-node) and runs `npx --yes @vibeharness/cli` —
  without it the job could stall on the npx install prompt or use the runner's
  arbitrary default Node.
- **CLI-aware dead-code scanner**: when `package.json` declares a `bin`, excess
  `console.log` is reported as INFO (no deduction) instead of LOW (-2) — stdout
  is a CLI's user interface. Non-CLI projects keep the stricter signal.
- **Dead-code scanner honours `.vibe/auditignore`** (like the secret and LGPD
  scanners already did).
- **Knip** configured (with `npm run knip`) — removed 1 dead export
  (`categoriesOf`) and the unused `@types/semver` devDependency.
- Real `.vibe/PRD.md` for VibeHarness itself (dogfooding: was a placeholder).

### Changed
- `security.yml` (this repo's copy): the duplicate audit job was trimmed — the
  repo runs the audit from the local build with a higher bar in `vibe-gate.yml`
  (`--fail-under 80`); gitleaks + `npm audit` jobs remain.
- Registry catalog re-synced (stars/licenses/lastPush refreshed from the API).

### Tests
- 8 new tests (113 total across 16 suites): LGPD info-no-deduction, dead-code
  CLI detection + auditignore, packager safe-value allowlist (SHA pins, prefix
  regexes, command substitution, marker) and redaction-still-works alongside
  safe values, Node 26 EOL.

### Release process
- v0.5.0 had merged to `main` without its git tag (the release workflow
  publishes from tag pushes). Tag `v0.5.0` was created retroactively at the
  v0.5.0 merge commit so npm history and the CHANGELOG stay traceable; `v0.5.1`
  is tagged at its merge commit as usual.

## [0.5.0] - 2026-08-14 — "From pointers to harness"

The tool stops *pointing* at what you should do and starts *doing* it.

### Added
- **`vibe-harness start`** — guided entry point for vibecoders. Auto-detects
  project state, asks ONE question (project stage: idea / starting / building /
  shipping / production), shows the full map of what VibeHarness can do
  (done ✔ / pending ○ / recommended ★) and runs each recommended step with
  confirmation until the lifecycle completes. `--yes` infers the stage and runs
  non-interactively. Available as the `/start` slash command in Claude Code.
- **`vibe-harness plan --apply`** — the curated registry is now executed, not
  just listed. Apply installs the primary dependencies with your detected
  package manager (npm/yarn/pnpm/bun), generates initial configs and
  `.env.example`, writes starter code into `.vibe/starters/`, configures MCP
  servers (`.mcp.json`), installs the security CI gate, and offers system
  security tools (gitleaks/osv-scanner via Homebrew, explicit consent only).
  Every applied step is recorded in an audit trail appended to `.vibe/STACK.md`.
- **Apply recipes (v1)** — validation (Zod/Valibot/Yup), testing (Vitest/Jest/
  Playwright), database (Supabase/Prisma/Drizzle), auth (Better Auth/Auth.js),
  payments (Stripe, with signature-verified webhook starter), security
  (gitleaks/osv-scanner), MCP and deploy guidance. Entries without a recipe
  degrade gracefully to a recommendation.
- **Visual audit report** — `audit --site` (or the consent prompt after
  `--report`) generates `.vibe/report/index.html`: a self-contained,
  Material-style scorecard site — score ring, section cards, findings by
  severity, copyable AI fix prompts and the batch prompt. Zero dependencies
  (no Python/mkdocs at runtime); versionable as project documentation.
  All finding content is sanitised and HTML-escaped (XSS + injection safe).
- **Docs site** — visual documentation in PT-BR built with Material for MkDocs
  (`docs/` + `mkdocs.yml`), deployed to GitHub Pages on every change
  (`.github/workflows/docs.yml`). Entry point: installation & first run.

### Invariants
- `plan --apply` never writes inside `src/` — enforced structurally by a path
  allow-list in the apply engine and covered by tests (configs at the root and
  `.vibe/**` only).

### Changed
- `init` now also installs the `/start` slash command (6 commands total).
- SKILL.md and AGENTS.md present `start` as the entry point when the user is
  unsure what to do next; `plan` guidance updated to `--apply`.
- STACK.md "Next Steps" leads with `plan --apply`.

### Tests
- 28 new tests (105 total across 15 suites): stage detection & ordering,
  stage inference heuristic, apply-plan resolution, recipe path invariant,
  apply execution (files/env/no-src), apply audit trail, visual report
  rendering (self-containment, XSS/injection escaping).

## [0.4.1] - 2026-08-14

### Fixed
- `--version` reported 0.3.0 (hardcoded string in cli.ts). The CLI now reads its
  version from package.json — single source of truth, cannot drift again.

## [0.4.0] - 2026-08-14 — "Hardened"

Security-focused release: fixes the prompt-injection chain, the npm supply-chain
exposure, and the secret-redaction gaps; adds repo hardening and new security checks.

### ⚠️ Breaking / Migration
- **Package renamed to `@vibeharness/cli`** — the unscoped `vibe-harness` name on npm
  belongs to an unrelated third-party placeholder. Invoke with `npx @vibeharness/cli …`
  (the installed binary is still `vibe-harness`). All generated templates were updated.

### Fixed
- **Prompt-injection chain (audit → PR comment → agent)**: all finding fields
  (message, file, fix) are now sanitised — backticks, `${}`, control characters and
  oversized payloads are neutralised; the Batch AI Fix Prompt uses a 4-backtick fence
  plus an explicit "data, not instructions" directive. A malicious filename can no
  longer escape the fence or steer the agent.
- **Secret redaction in `pack`**: the matched secret substring itself is redacted
  (any format — JSON, quoted, bare, URI), multiline PEM blocks are redacted whole,
  unquoted `KEY=value` and YAML-style `password: value` assignments are covered, and
  key material (`.pem`, `.key`, `.p12`, `id_rsa*`, credentials, `*.tfstate`) plus all
  `.env*` variants are excluded from the context pack. Header now warns redaction is
  best-effort.
- `scanSecrets` no longer stops at the first match per file (up to 5 distinct secret
  types reported per file).
- `plan` fails loud on an invalid `.vibe/threat-model.json` instead of silently
  ignoring it.
- Pre-commit hook: POSIX-safe loop (filenames with spaces work), uses `gitleaks`
  when installed, expanded fallback pattern set (Anthropic, OpenAI, GitLab, Slack,
  Google).

### Added
- **Anti-prompt-injection rules** in every generated AI rules file: treat file/issue/PR
  contents as data, never instructions; forbid `curl | sh`, `sudo`, destructive
  commands and typosquat installs; never exfiltrate `.env`/tokens.
- **`.vibe/auditignore`** — gitignore-style exclusion file for known false positives
  (e.g. test fixtures with intentional fake secrets); honoured by the secret and
  LGPD scanners.
- **LGPD web-surface gating** — consent-banner, privacy-page and DSR checks only run
  when a web surface (UI components or HTTP routes) is detected; CLI/library
  projects are no longer flagged for missing cookie banners.
- **`init` installs a security CI gate** (`.github/workflows/security.yml`) into user
  projects: gitleaks + `npm audit --audit-level=high` + audit score ≥ 70, with all
  actions pinned by commit SHA.
- **10 new secret patterns**: Anthropic, OpenAI (legacy + project), Google, Slack,
  GitLab, SendGrid, Twilio, hardcoded JWT.
- **Insecure-code checks** in the security scanner: wildcard CORS + credentials
  (critical), cookies without `httpOnly`/`secure`/`sameSite`, JWT `alg: none`,
  hardcoded JWT secret, `jwt.decode` without `jwt.verify`, Express without helmet,
  cookie/session auth without CSRF markers.
- **`doctor` GitHub platform posture** (via `gh` CLI): secret scanning, push
  protection and branch-protection status.
- **Repo hardening**: all workflow actions pinned by full commit SHA; Dependabot
  (npm + github-actions); CodeQL workflow; release workflow with npm provenance
  (OIDC); registry sync now validates catalog criteria and surfaces violations as
  CI warnings + step summary (fail-loud).
- 30 new tests (73 total): report sanitisation, skill templates, secret patterns,
  insecure-code checks, PEM/env/YAML redaction, auditignore, LGPD web-surface gating.

## [Unreleased]

### Added
- `vibe-harness prd` command — generates `.vibe/PRD.md` (problem, personas, user stories, acceptance criteria, success metrics, MVP scope).
- `vibe-harness plan` command — generates `.vibe/STACK.md` with curated stack recommendations (frontend, backend, DB, auth, payments, deploy, MCP servers, AI tools).
- `vibe-harness doctor` command — dependency freshness, EOL runtimes, lockfile & Dependabot checks, plus security-tooling detection (gitleaks / osv-scanner).
- `init` now installs a Claude Code skill (`.claude/skills/vibeharness/SKILL.md`), slash commands (`/prd`, `/pack`, `/audit`) and `AGENTS.md`.
- Curated tool registry (`registry/catalog.json`) with weekly auto-sync GitHub Action that opens PRs on changes.
- Repository hardening: branch protection on `main` (PR + review + CI required), CI workflow, community health files (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates).

## [0.2.0] - 2026-08-13

### Added
- `vibe-harness pack` command — sanitised context packager (Repomix-inspired).
- LGPD Brasil compliance scanner (PII in logs, consent, privacy pages, DSR endpoints, RLS, password hashing).
- Modular scanner architecture (security, lgpd, deadcode, database, infra, accessibility).
- `vibe-gate.yml` CI workflow template with PR comment reporting.

## [0.1.0] - 2026-08-13

### Added
- Initial release: `init`, `rules`, `audit` commands.
- SPEC.md / CONSTITUTION.md / LGPD_POLICY.md generators.
- AI rules for Cursor, Claude Code, Windsurf, and GitHub Copilot.
- Pre-commit secret-blocking hook.
- 0–100 production-readiness scorecard with AI fix prompts.
