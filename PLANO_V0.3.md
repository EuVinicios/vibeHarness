# VibeHarness v0.3.0 — Plano de Evolução

> Data: 2026-08-14 · Proposta gerada a partir de análise do repositório
> Referências: spec-kit (128k⭐), superpowers (272k⭐), anthropics/skills (169k⭐),
> OpenSpec (65k⭐), BMAD-METHOD (52k⭐), repomix (28k⭐), gitleaks (29k⭐), osv-scanner (11k⭐)

## Diagnóstico atual (v0.2.0)

- CLI TypeScript com 3 fases: `init` (spec/regras/hook), `pack` (contexto sanitizado), `audit` (scorecard 0–100).
- Repo público, licença MIT detectada, default branch `main`, **sem branch protection**.
- Lacunas: sem PRD, sem recomendação de stack, sem atualização de dependências,
  sem registro curado de ferramentas, sem arquivos de comunidade, sem CI de testes do próprio repo.

---

## Etapa 1 — Configuração do GitHub

1. **Branch protection na `main`** (via `gh api`):
   - Exigir PR + 1 review approving
   - Status checks obrigatórios: `test`
   - Bloquear force-push e delete
   - `enforce_admins: true` (todos via PR, inclusive o maintainer)
   - Forks não são afetados por branch protection
2. **Workflow CI do repo** (`.github/workflows/ci.yml`): `npm ci` + `npm run build` + `npm test` em PRs (status check exigido pela proteção).
3. **Arquivos de comunidade**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, templates de issue (bug, feature, sugestão de regra), template de PR.
4. **Metadata**: topics (`vibecoding`, `spec-driven`, `ai-agent`, `security`, `lgpd`, `cli`) e descrição revisada via `gh repo edit`.

## Etapa 2 — Metodologia spec-driven

Ciclo completo: `PRD → Spec/Constitution → Plan(stack) → Implement(rules+pack) → Audit`

5. **Novo comando `vibe-harness prd`** → `.vibe/PRD.md`:
   - Problema, personas, user stories, critérios de aceite, métricas de sucesso, escopo MVP, fora de escopo.
   - Interativo (enquirer) + modo `--yes`.
6. **Novo comando `vibe-harness plan`** → `.vibe/STACK.md`:
   - Recomendação de front, back, DB, auth, pagamentos, deploy, MCPs e ferramentas de IA.
   - Baseado no registro curado (Etapa 5) + respostas do threat model (`threat-model.json`).
7. **README atualizado** com o ciclo completo e tabela de comandos.

## Etapa 3 — Distribuição híbrida: CLI como motor, skill como interface

8. `init` passa a instalar também:
   - `.claude/skills/vibeharness/SKILL.md` + slash commands (`/prd`, `/pack`, `/audit`)
   - `AGENTS.md` (opencode/Codex)
   - Skill **invoca o CLI** — sem duplicar lógica (modelo spec-kit).
9. **Publicação npm** (`vibe-harness`): validar nome disponível, `prepublishOnly` já existe; documentar release process no CONTRIBUTING.

## Etapa 4 — Segurança, organização e manutenção

10. **Novo comando `vibe-harness doctor`**:
    - Dependências desatualizadas (`npm outdated`), runtimes EOL, pacotes deprecated.
    - Gera `.github/dependabot.yml` (ou `renovate.json`) no projeto alvo — evita obsolescência.
11. **Hardening de segurança**:
    - Alinhar padrões de secrets ao gitleaks (engine opcional se binário presente).
    - Suporte a OSV-Scanner para CVEs multi-ecossistema (além do `npm audit`).
    - Checks de supply chain: lockfile commitado, `npm ci` no CI, `.env` fora do git.
    - Checklist de segurança do GitHub (secret scanning, Dependabot alerts).

## Etapa 5 — Registro curado auto-atualizável

12. **`registry/catalog.json`** curado: ferramentas por categoria (frontend, backend, DB, auth, pagamentos, testes, MCP, AI rules) com `repo`, `stars`, `license`, `lastVerified`, `tags`, `notes`.
    - Critérios: licença OSI apenas (AGPL bloqueado por default), push < 90 dias, mínimo de stars, security policy presente.
13. **`.github/workflows/registry-sync.yml`**: cron semanal consulta a API do GitHub, atualiza `stars`/`lastVerified` e **abre PR automaticamente** quando há mudanças (modelo Renovate).
14. `plan` usa o snapshot local (sem rede em runtime) e emite aviso se o catálogo tiver > 30 dias.

---

## Decisões aprovadas

| Decisão | Escolha |
|---|---|
| Distribuição | CLI + Skill híbrido |
| Branch protection | `enforce_admins: true` (todos via PR) |
| Registro | Action semanal + PR automático |
| Escopo | Executar Etapas 1–5, começando pela Etapa 1 |

## Ordem de execução

1. Etapa 1 (config GitHub) → 2. Etapa 3 (skill/AGENTS.md) → 3. Etapa 2 (prd/plan) → 4. Etapa 4 (doctor/hardening) → 5. Etapa 5 (registro)

## Riscos e mitigação

- **Nome npm ocupado** → verificar antes; fallback `vibeharness` ou escopo `@euvinicios/vibe-harness`.
- **enforce_admins trava o maintainer** → manter um branch `dev` livre para trabalho rápido; merges via PR.
- **Rate limit da API do GitHub no cron** → usar `GITHUB_TOKEN` do próprio workflow (5k req/h).
