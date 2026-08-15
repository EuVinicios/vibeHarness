# Ferramentas validadas

> Esta página declara **todas** as ferramentas que o VibeHarness usa, recomenda ou instala.
> Gerada automaticamente a partir de `registry/catalog.json`, das recipes de aplicação e das
> dependências do CLI — re-generada a cada sync do registro.

## Critérios de validação

Todo projeto do catálogo curado passa por três filtros (sync semanal via GitHub API):

- **Adoção mínima:** ⭐ 3,000 stars
- **Atividade:** push nos últimos 90 dias
- **Licença:** apenas `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `CC0-1.0`, `Unlicense` (OSI-approved)

_Último sync do registro: **2026-08-14**._

---

## 1. O que roda dentro do próprio CLI

Dependências de runtime do `@vibeharness/cli` (o código que executa na sua máquina):

| Pacote | Papel |
|--------|-------|
| `@modelcontextprotocol/sdk` ^1.30.0 | Servidor MCP (stdio) — a interface com os clientes de IA |
| `chalk` ^6.0.0 | Cores no terminal |
| `commander` ^15.0.0 | Parsing dos comandos do CLI |
| `enquirer` ^2.4.1 | Perguntas interativas no terminal |
| `fast-glob` ^3.3.2 | Varredura de arquivos (scanners, pack, detecção) |
| `zod` ^4.4.3 | Validação tipada dos inputs das tools MCP |

!!! success "Zero rede em runtime"
    Nenhuma dependência faz chamada de rede durante o uso: o registro é um
    snapshot dentro do pacote e o MCP roda local via stdio.

---

## 2. O que o `plan --apply` instala e configura de verdade

Estas são as ferramentas com **recipe de aplicação** — o VibeHarness instala as
dependências, gera configs e starters (sempre fora do seu `src/`):

| Ferramenta | Categoria | O que o apply faz |
|------------|-----------|-------------------|
| [Supabase](https://github.com/supabase/supabase) | Banco de dados | instala `@supabase/supabase-js` + cliente starter + env vars |
| [Prisma](https://github.com/prisma/prisma) | Banco de dados | instala Prisma + schema starter + env vars |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | Banco de dados | instala Drizzle + config + schema starter + env vars |
| [Auth.js (NextAuth)](https://github.com/nextauthjs/next-auth) | Autenticação | instala `next-auth` + starter + env vars |
| [Better Auth](https://github.com/better-auth/better-auth) | Autenticação | instala `better-auth` + starter + env vars |
| [Stripe Node SDK](https://github.com/stripe/stripe-node) | Pagamentos | instala `stripe` + webhook starter (verificação de assinatura) + env vars |
| [Zod](https://github.com/colinhacks/zod) | Validação de entrada | instala `zod` + starter de schema |
| [Valibot](https://github.com/fabian-hiller/valibot) | Validação de entrada | instala `valibot` + starter de schema |
| [Yup](https://github.com/jquense/yup) | Validação de entrada | instala `yup` + starter de schema |
| [Vitest](https://github.com/vitest-dev/vitest) | Testes | instala `vitest` + config + teste de exemplo |
| [Playwright](https://github.com/microsoft/playwright) | Testes | instala `@playwright/test` + config de E2E |
| [Jest](https://github.com/jestjs/jest) | Testes | instala `jest` (config por conta do projeto) |
| [Coolify](https://github.com/coollabsio/coolify) | Deploy / Hospedagem | orientação de deploy self-hosted + env vars |
| [MCP Reference Servers](https://github.com/modelcontextprotocol/servers) | Servidores MCP | escreve `.mcp.json` com servidores MCP curados |
| [Gitleaks](https://github.com/gitleaks/gitleaks) | Segurança | binário de sistema (Homebrew, com consentimento) — scan de segredos |
| [OSV-Scanner](https://github.com/google/osv-scanner) | Segurança | binário de sistema (Homebrew, com consentimento) — CVEs multi-ecossistema |

!!! warning "Nada é aplicado sem a sua confirmação"
    Binários de sistema (gitleaks, osv-scanner) só são instalados com consentimento
    explícito; em modo `--yes` são pulados com instruções.

---

## 3. Catálogo curado completo (recomendações)

Projetos validados pelos critérios acima. Os que têm recipe aparecem na seção 2;
os demais são **recomendações curadas** exibidas no `.vibe/STACK.md`:

### Frontend

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [React](https://github.com/facebook/react) | 247,270 | MIT | 2026-08-14 | UI library; pair with Next.js, Vite or Astro. |
| [Next.js](https://github.com/vercel/next.js) | 141,796 | MIT | 2026-08-14 | Default choice for React fullstack apps; App Router + server actions. |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 97,253 | MIT | 2026-08-14 | Utility-first CSS; strong AI-codegen affinity. |
| [Svelte](https://github.com/sveltejs/svelte) | 87,988 | MIT | 2026-08-14 | Compiler-based UI framework; use with SvelteKit. |
| [Vite](https://github.com/vitejs/vite) | 82,353 | MIT | 2026-08-14 | Fast build tool for SPAs and libraries. |
| [Astro](https://github.com/withastro/astro) | 61,776 | MIT | 2026-08-14 | Best for content-heavy sites and landing pages. |

### Backend

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [NestJS](https://github.com/nestjs/nest) | 76,378 | MIT | 2026-08-14 | Structured, opinionated framework for larger teams. |
| [Express](https://github.com/expressjs/express) | 69,368 | MIT | 2026-08-01 | Most-known Node HTTP framework; huge ecosystem. |
| [Fastify](https://github.com/fastify/fastify) | 36,989 | MIT | 2026-08-14 | High-performance alternative to Express with schema validation built in. |
| [Hono](https://github.com/honojs/hono) | 31,664 | MIT | 2026-08-14 | Ultrafast, portable across Workers, Deno, Bun, Node. |

### Banco de dados

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Supabase](https://github.com/supabase/supabase) — **com apply** | 107,993 | Apache-2.0 | 2026-08-14 | Postgres + Auth + Storage; enable RLS on every table. |
| [Prisma](https://github.com/prisma/prisma) — **com apply** | 47,577 | Apache-2.0 | 2026-08-14 | Typed ORM with versioned migrations. |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) — **com apply** | 35,479 | Apache-2.0 | 2026-08-12 | SQL-first lightweight ORM; great edge/serverless fit. |

### Autenticação

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Better Auth](https://github.com/better-auth/better-auth) — **com apply** | 29,542 | MIT | 2026-08-14 | Modern TypeScript-first auth framework. |
| [Auth.js (NextAuth)](https://github.com/nextauthjs/next-auth) — **com apply** | 28,325 | ISC | 2026-07-22 | Framework-agnostic auth; first-party Next.js integration. |

### Pagamentos

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Stripe Node SDK](https://github.com/stripe/stripe-node) — **com apply** | 4,484 | MIT | 2026-08-14 | Official SDK; always verify webhook signatures and use idempotency keys. |

### Validação de entrada

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Zod](https://github.com/colinhacks/zod) — **com apply** | 43,461 | MIT | 2026-08-14 | Default schema validation for TypeScript APIs. |
| [Yup](https://github.com/jquense/yup) — **com apply** | 23,675 | MIT | 2026-08-12 | Mature option, common in form ecosystems. |
| [Valibot](https://github.com/fabian-hiller/valibot) — **com apply** | 8,928 | MIT | 2026-08-13 | Smaller bundle alternative to Zod. |

### Testes

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Playwright](https://github.com/microsoft/playwright) — **com apply** | 94,524 | Apache-2.0 | 2026-08-14 | Default E2E browser testing. |
| [Jest](https://github.com/jestjs/jest) — **com apply** | 45,469 | MIT | 2026-08-14 | Mature runner; preferred when the stack already uses it. |
| [Testing Library](https://github.com/testing-library/react-testing-library) | 19,644 | MIT | 2026-04-02 | User-centric component testing. Main branch is stable-only (development happens in the testing-library monorepo) — the sync's 90-day push warning for this entry is expected noise. |
| [Vitest](https://github.com/vitest-dev/vitest) — **com apply** | 16,948 | MIT | 2026-08-14 | Default unit test runner for Vite/TS projects. |

### Deploy / Hospedagem

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Coolify](https://github.com/coollabsio/coolify) — **com apply** | 60,584 | Apache-2.0 | 2026-08-14 | Self-hostable PaaS (Vercel/Heroku alternative). |
| [CapRover](https://github.com/caprover/caprover) | 15,129 | Apache-2.0 | 2026-08-08 | Docker-based PaaS; slower release cadence. |
| [Kamal](https://github.com/basecamp/kamal) | 14,507 | MIT | 2026-08-12 | Deploy web apps anywhere (37signals). Zero-downtime deploys to your own servers. |

### Servidores MCP

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [MCP Reference Servers](https://github.com/modelcontextprotocol/servers) — **com apply** | 89,561 | NOASSERTION | 2026-08-10 | Official reference MCP servers (mixed per-server licenses — check each). |
| [GitHub MCP Server](https://github.com/github/github-mcp-server) | 32,249 | MIT | 2026-08-14 | GitHub tools (issues, PRs, repos) for AI agents. |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | 13,169 | Apache-2.0 | 2026-08-14 | Build custom MCP servers in TypeScript. |

### Ferramentas de desenvolvimento com IA

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Superpowers](https://github.com/obra/superpowers) | 272,141 | MIT | 2026-08-13 | Battle-tested skills: brainstorm → plan → implement with TDD. |
| [Anthropic Skills](https://github.com/anthropics/skills) | 169,406 | none | 2026-08-13 | Official skills examples; check license per skill before reuse. |
| [Claude Code](https://github.com/anthropics/claude-code) | 141,461 | none | 2026-08-13 | Anthropic's coding agent (proprietary CLI; repo for issues/examples). |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | 128,380 | MIT | 2026-08-14 | Spec-driven development toolkit; methodology reference for VibeHarness. |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 64,897 | MIT | 2026-08-14 | Spec-first change workflow for AI coding. |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) | 51,912 | NOASSERTION | 2026-08-14 | Agentic agile framework with PRD-driven workflow. |
| [Awesome Cursor Rules](https://github.com/PatrickJS/awesome-cursorrules) | 40,588 | CC0-1.0 | 2026-05-30 | Community rule collection; mine for language-specific guardrails. |
| [Repomix](https://github.com/yamadashy/repomix) | 27,846 | MIT | 2026-08-11 | Reference implementation for context packing (inspired vibe-harness pack). |
| [Agent OS](https://github.com/BuilderMethods/agent-os) | 5,270 | MIT | 2026-05-05 | Reusable standards/specs/roadmap layers for AI projects. Content-complete methodology repo — slow push cadence is expected (sync's 90-day warning for it is noise). |

### Segurança

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Gitleaks](https://github.com/gitleaks/gitleaks) — **com apply** | 28,720 | MIT | 2026-07-29 | Reference secret scanner; pattern source for vibe-harness. |
| [TruffleHog](https://github.com/trufflesecurity/trufflehog) | 27,462 | AGPL-3.0 | 2026-08-14 | Verified secret detection including git history. |
| [Semgrep](https://github.com/semgrep/semgrep) | 16,225 | LGPL-2.1 | 2026-08-14 | Fast SAST with community rule packs. |
| [OSV-Scanner](https://github.com/google/osv-scanner) — **com apply** | 10,832 | Apache-2.0 | 2026-08-14 | Multi-ecosystem CVE scanning via OSV.dev. |

### Manutenção de dependências

| Projeto | ⭐ | Licença | Último push | Nota |
|---------|---:|---------|-------------|------|
| [Renovate](https://github.com/renovatebot/renovate) | 22,264 | AGPL-3.0 | 2026-08-14 | Automated dependency updates; use as hosted app, not vendored code. |
| [Dependabot Core](https://github.com/dependabot/dependabot-core) | 5,722 | MIT | 2026-08-14 | Engine behind GitHub Dependabot; prefer the built-in GitHub feature. |

---

## 4. Ferramentas de sistema integradas

| Ferramenta | Onde atua | Instalação |
|------------|-----------|------------|
| [gitleaks](https://github.com/gitleaks/gitleaks) | Hook de pre-commit + CI (`security.yml`) — 150+ regras de segredo | Homebrew, com consentimento (fallback: padrões embutidos) |
| [osv-scanner](https://github.com/google/osv-scanner) | CVEs multi-ecossistema via OSV.dev (complementa `npm audit`) | Homebrew, com consentimento |

_Gerado por `scripts/gen-tools-doc.mjs` — não edite manualmente._
