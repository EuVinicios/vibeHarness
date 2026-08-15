# `install` — conecte o VibeHarness à sua IA

Um comando para registrar o harness no seu cliente de IA: regras + servidor MCP
+ skills, sem editar nada manualmente.

```bash
npx @vibeharness/cli install                    # detecta (ou pergunta) o cliente
npx @vibeharness/cli install claude-code        # explícito
npx @vibeharness/cli install cursor,opencode    # vários de uma vez
npx @vibeharness/cli install all                # todos os suportados
npx @vibeharness/cli install --json             # saída máquina-legível
```

Clientes: `claude-code`, `cursor`, `opencode`, `vscode-copilot`, `windsurf`,
`antigravity` (beta), `qwen` (beta).

!!! tip "Usa mais de um cliente?"
    Se o projeto tiver sinais de vários clientes, a seleção interativa oferece
    **"Todos os detectados"** como primeira opção — ou passe a lista separada
    por vírgulas direto no comando.

---

## O que o comando escreve

1. **Regras do cliente** — `CLAUDE.md`, `.cursor/rules/vibeharness.mdc`,
   `AGENTS.md`, `.github/copilot-instructions.md` ou `.windsurfrules`
2. **Registro do MCP** — mesclado na config do cliente sem apagar servidores
   existentes (`.mcp.json`, `.cursor/mcp.json`, `opencode.json`,
   `.vscode/mcp.json`, Windsurf global…)
3. **Extras** — skill e slash commands (Claude Code)

Depois: **reinicie o cliente e aprove o servidor MCP**. A partir daí a IA usa
as tools `vibe_*` — veja [Usando com a sua IA](../usando-com-sua-ia.md).

## Adaptadores declarativos

Cada cliente é uma entrada em `registry/clients.json` (detecção por globs,
arquivo de regras, formato do config MCP). Adicionar um cliente novo é
acrescentar JSON — nunca código.

---

[:octicons-arrow-left-24: Anterior: `status`](status.md){ .md-button }
[:octicons-arrow-right-24: Próximo: `prd`](prd.md){ .md-button .md-button--primary }
