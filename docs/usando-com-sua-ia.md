# Usando com a sua IA (MCP)

> **v0.7 — a IA do cliente é a interface.** Em vez de ensinar o vibecoder um
> fluxo de terminal, o VibeHarness se registra no seu cliente de IA e deixa a
> própria IA orquestrar o ciclo — você só conversa.

## Instalação em 1 comando

```bash
npx @vibeharness/cli install
```

O instalador detecta (ou pergunta) o seu cliente de IA e escreve tudo — e se
você usa **vários** clientes (o comum), instale todos de uma vez:

```bash
npx @vibeharness/cli install cursor,opencode   # lista separada por vírgulas
npx @vibeharness/cli install all               # todos os suportados
```

O que é escrito em cada cliente:

1. **Arquivo de regras** do cliente (CLAUDE.md, `.cursor/rules`, AGENTS.md…)
2. **Registro do servidor MCP** — mesclado na config do cliente, sem apagar servidores existentes
3. **Extras** (Claude Code: skill + slash commands `/status`, `/prd`, `/plan`…)

Clientes suportados:

| Cliente | Status | Config MCP usada |
|---------|--------|------------------|
| Claude Code | :white_check_mark: estável | `.mcp.json` na raiz |
| Cursor | :white_check_mark: estável | `.cursor/mcp.json` |
| opencode | :white_check_mark: estável | `opencode.json` |
| VS Code Copilot | :white_check_mark: estável | `.vscode/mcp.json` |
| Windsurf | :white_check_mark: estável | `~/.codeium/windsurf/mcp_config.json` (global) |
| Antigravity | :warning: beta | `.agents/mcp_config.json` (o Antigravity IDE não lê `.mcp.json`) |
| Qwen Code | :warning: beta | `.qwen/settings.json` |

??? warning "Instalando dentro do próprio repo do VibeHarness?"
    O `install` detecta o self-install e registra o build local
    (`node ./dist/cli.js mcp`) em vez de `npx`: dentro de um projeto cujo
    `package.json` se declara `@vibeharness/cli`, o `npm exec` não resolve o
    bin e o servidor sairia com erro 127. Rode `npm run build` sempre que
    mudar o `src/`.

??? tip "Adicionar um cliente novo?"
    Os adaptadores são dados: basta acrescentar uma entrada em
    `registry/clients.json` (detecção, arquivo de regras, formato do MCP).
    Nenhum código em `src/` precisa mudar.

Depois de instalar: **reinicie o cliente, aprove o servidor MCP** e converse:

> *"quero um SaaS de agendamentos"*

## O que a IA faz sozinha

As tools `vibe_*` carregam o ciclo na própria descrição — qualquer modelo sabe
a ordem: `status → init → prd → plan → pack → audit → doctor`.

| Tool | O que faz |
|------|-----------|
| `vibe_status` | Fase, progresso do ciclo, score, checklist de starters, próximo passo + prompt pronto |
| `vibe_init` / `vibe_prd` | Fundação e PRD — os questionários voltam como `pendingQuestions` e a IA pergunta **no chat** |
| `vibe_plan` | Stack curada; `apply: true` instala deps/configs e devolve `wiringInstructions` |
| `vibe_pack` | Contexto sanitizado (segredos redigidos) |
| `vibe_audit` | Score 0–100 + findings + fix prompt — a IA corrige os próprios achados |
| `vibe_doctor` / `vibe_rules` / `vibe_install` | Manutenção, regras, setup de cliente |

O loop fecha sozinho: a IA roda a auditoria, lê os findings, aplica o fix
prompt (que é sanitizado contra prompt injection), re-audita até passar.

## Painel no terminal (opcional)

```bash
npx @vibeharness/cli status        # painel não-interativo
npx @vibeharness/cli status --json # mesmo dado, formato máquina
```

Mostra fase, ciclo de vida (✔ concluído / ★ recomendado), score cacheado e o
prompt pronto para colar na sua IA — útil quando o MCP não está disponível.

!!! warning "O cockpit interativo (v0.6) foi aposentado"
    `start` continua funcionando com aviso de deprecação por um release, mas o
    caminho recomendado é `install` + conversa com a sua IA.
