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

## Uso recomendado: instale na sua IA

No diretório do seu projeto:

```bash
npx @vibeharness/cli install
```

É só isso. O instalador registra o harness no seu cliente de IA (regras +
servidor MCP + skills) — depois de reiniciar o cliente e aprovar o servidor,
**a própria IA orquestra o ciclo** (`prd → init → plan --apply → pack →
audit → doctor`) e corrige os próprios achados. Veja
[Usando com a sua IA](usando-com-sua-ia.md).

!!! note "Prefere terminal?"
    `npx @vibeharness/cli status` mostra o painel com o próximo passo; todos
    os comandos aceitam `--json` para scripts e CI.

## Uso direto (para quem já conhece)

```bash
npx @vibeharness/cli init         # spec, regras de IA, hook anti-segredos
npx @vibeharness/cli prd          # documento de requisitos
npx @vibeharness/cli plan --apply # stack curada, instalada e configurada
npx @vibeharness/cli pack         # contexto sanitizado para a IA
npx @vibeharness/cli audit --report
npx @vibeharness/cli doctor --fix
```

## Com a sua IA (MCP + Skill)

O `install` registra o servidor MCP e a camada de skill — a sua IA passa a dirigir o CLI sozinha:

| Ferramenta | O que é instalado |
|------------|-------------------|
| Claude Code | MCP + skill + slash commands (`/status`, `/install`, `/prd`, `/plan`, `/pack`, `/audit`, `/doctor`) |
| Cursor | MCP (`.cursor/mcp.json`) + regras |
| opencode | MCP (`opencode.json`) + `AGENTS.md` |
| VS Code Copilot | MCP (`.vscode/mcp.json`) + instruções |
| Windsurf | MCP (config global) + regras |
| Antigravity / Qwen | MCP + `AGENTS.md` (beta) |

Dentro do cliente, basta pedir: **"rode vibe status"** — ou simplesmente dizer *"quero um app de X"*.

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
