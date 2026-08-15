# Instalação

O VibeHarness é um CLI publicado no npm — **não precisa instalar nada globalmente**.
Você roda direto no diretório do seu projeto.

---

## Requisitos

-   :simple-node-dot-js: **Node.js 18+** (recomendado: LTS atual)
-   Um projeto (novo ou existente) — qualquer stack

Verifique com:

```bash
node --version
```

## Uso recomendado: o Conductor Interativo

No diretório do seu projeto:

```bash
npx @vibeharness/cli
```

É só isso. O Conductor abre o cockpit e conduz o ciclo em um loop fechado:

1. Explica onde o projeto está e qual a próxima meta
2. Gera o **prompt cirúrgico** — `Enter` copia para o clipboard
3. Você cola na sua IA (Cursor, Claude Code, Copilot…) e recebe o código
4. `V` valida localmente em milissegundos; se falhar, o prompt de correção já vem pronto

Na primeira execução em um projeto novo, o ciclo completo é:
`prd → init → plan --apply → pack → audit → doctor`.

!!! note "Sem terminal interativo (CI, pipes)?"
    Use `npx @vibeharness/cli start --yes` — infere o estágio e executa os
    passos com defaults seguros.

## Uso direto (para quem já conhece)

```bash
npx @vibeharness/cli init         # spec, regras de IA, hook anti-segredos
npx @vibeharness/cli prd          # documento de requisitos
npx @vibeharness/cli plan --apply # stack curada, instalada e configurada
npx @vibeharness/cli pack         # contexto sanitizado para a IA
npx @vibeharness/cli audit --report
npx @vibeharness/cli doctor --fix
```

## Com a sua IA (Skill)

O `init` instala automaticamente a camada de skill — a sua IA passa a dirigir o CLI sozinha:

| Ferramenta | O que é instalado |
|------------|-------------------|
| Claude Code | Skill + slash commands (`/start`, `/prd`, `/plan`, `/pack`, `/audit`, `/doctor`) |
| Cursor / Windsurf / Copilot | Arquivos de regras com os guardrails de segurança |
| opencode / Codex | `AGENTS.md` com o fluxo completo |

Dentro do Claude Code, basta pedir: **"/start"** — ou simplesmente dizer *"não sei por onde começar"*.

!!! warning "Sobre o nome do pacote"
    Use sempre **`@vibeharness/cli`** (com o escopo). O nome `vibe-harness` sem escopo
    no npm pertence a terceiros não relacionados. O binário instalado continua sendo
    `vibe-harness`.

## O que é criado no seu projeto

```text
.vibe/
├── PRD.md               ← requisitos do produto
├── SPEC.md              ← especificação técnica
├── CONSTITUTION.md      ← leis de arquitetura inegociáveis
├── LGPD_POLICY.md       ← checklist de conformidade
├── STACK.md             ← decisões de stack + trilha do --apply
├── threat-model.json    ← modelo de ameaça
└── starters/            ← código inicial gerado pelo plan --apply

CLAUDE.md / .cursorrules / .windsurfrules   ← regras para a sua IA
.github/workflows/security.yml              ← CI de segurança
.git/hooks/pre-commit                       ← bloqueio de segredos
.env.example                                ← variáveis necessárias (sem valores reais)
```

!!! success "Nada é enviado para fora"
    O VibeHarness roda 100% localmente. O registro curado é um snapshot
    dentro do pacote — nenhum dado do seu projeto sai da sua máquina.

<div class="grid" markdown>

[:octicons-arrow-right-24: **Próximo: Guia por estágio**](guia-por-estagio.md){ .md-button .md-button--primary }

[:octicons-command-palette-16: **Ver todos os comandos**](comandos/start.md){ .md-button }

</div>
