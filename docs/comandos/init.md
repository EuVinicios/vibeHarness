# `init` — fundação do projeto

Gera a especificação, as regras para a sua IA e os mecanismos de segurança — tudo de uma vez.

```bash
npx @vibeharness/cli init          # interativo (recomendado)
npx @vibeharness/cli init --yes    # padrões seguros, sem perguntas
npx @vibeharness/cli init --json   # saída máquina-legível (agentes/CI)
```

!!! tip "Com MCP instalado"
    A tool `vibe_init` faz o mesmo — e o questionário de ameaça vira
    perguntas da sua IA no chat (`pendingQuestions`).

---

## O que é criado

=== "Especificação (.vibe/)"

    - `SPEC.md` — especificação técnica (regras de negócio, dados, arquitetura)
    - `CONSTITUTION.md` — leis inegociáveis de arquitetura e segurança
    - `LGPD_POLICY.md` — checklist de conformidade LGPD
    - `threat-model.json` — modelo de ameaça estruturado

=== "Regras para a IA"

    - `CLAUDE.md`, `.cursorrules`, `.cursor/rules/`, `.windsurfrules`,
      `.github/copilot-instructions.md`, `AGENTS.md`
    - Skill do Claude Code + slash commands (`/status`, `/install`, `/prd`,
      `/plan`, `/pack`, `/audit`, `/doctor`)

    As regras obrigam: validação de toda entrada, zero segredos hardcoded,
    defesa contra prompt injection, SQL parametrizado, RLS, TDD em rotas críticas.

=== "Segurança ativa"

    - `.github/workflows/security.yml` — gitleaks + CVE audit + gate de score no CI
    - `.git/hooks/pre-commit` — bloqueia commit com chave de API
      (usa gitleaks quando instalado; senão, padrões embutidos)

## O questionário de ameaça

O `init` pergunta (uma resposta rápida cada):

1. :credit_card: O projeto processa **pagamentos**?
2. :lock: Tem **autenticação** de usuários?
3. :detective: Armazena **dados pessoais** (LGPD)?
4. :earth_americas: Escopo regulatório principal?

As respostas calibram as regras, a política LGPD e as recomendações do [`plan`](plan.md).

---

[:octicons-arrow-left-24: Anterior: `prd`](prd.md){ .md-button }
[:octicons-arrow-right-24: Próximo: `plan --apply`](plan.md){ .md-button .md-button--primary }
