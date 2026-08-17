# `install` — conecte o VibeHarness à sua IA

Um comando para registrar o harness no seu cliente de IA: regras + servidor MCP
+ skills, sem editar nada manualmente.

```bash
npx @vibeharness/cli install                    # detecta (ou pergunta) o cliente
npx @vibeharness/cli install claude-code        # explícito
npx @vibeharness/cli install cursor,opencode    # vários de uma vez
npx @vibeharness/cli install all                # todos os suportados
npx @vibeharness/cli install --force            # sobrescreve regras/extras existentes
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
   `AGENTS.md`, `.github/copilot-instructions.md` ou `.windsurfrules`.
   Se o arquivo já existir, o VibeHarness **preserva 100% das regras existentes**
   e mescla a seção de governança delimitada por `<!-- vibe-harness:start -->`.
2. **Registro do MCP** — mesclado na config do cliente sem apagar servidores
   existentes (`.mcp.json`, `.cursor/mcp.json`, `opencode.json`,
   `.vscode/mcp.json`, `.agents/mcp_config.json`, Windsurf global…)
3. **Extras** — skill e slash commands (Claude Code)
4. **Painel de Onboarding Visual** — exibe resumo das capacidades MCP ativadas
   e um prompt pronto para colar no chat da IA.

Depois: **reinicie o cliente e aprove o servidor MCP**. A partir daí a IA usa
as tools `vibe_*` — veja [Usando com a sua IA](../usando-com-sua-ia.md).

!!! success "Política de escrita segura e mesclagem inteligente"
    - **Mesclagem inteligente de regras**: arquivos existentes de regras têm seu
      conteúdo original preservado; o bloco VibeHarness é inserido/atualizado entre
      marcadores `<!-- vibe-harness:start -->` e `<!-- vibe-harness:end -->`.
      Use `--force` para sobrescrever o arquivo inteiro.
    - **Config inválida = erro, nunca perda**: se a config do cliente existir
      mas não for JSON válido (ou não for um objeto), o install **falha alto
      sem escrever nada** — nada de substituir sua config por engano.
    - **Backup antes do merge**: configs válidas recebem um `.vibe-bak` ao
      lado antes de serem reescritas.
    - **Escrita atômica e sem symlinks**: cada arquivo é escrito em temporário
      e renomeado; o install nunca escreve através de um symlink plantado no
      projeto.
    - **Falha isolada**: um cliente com problema não aborta os demais — o
      resultado lista os erros por cliente.

!!! success "Hardening de certificação (v0.8.3)"
    - **Symlink = erro, nunca falso sucesso**: se a config MCP do cliente for
      um symlink (ou qualquer diretório do caminho for symlink para fora do
      projeto), o install **reporta a recusa** em vez de dizer "merged".
    - **Registro pinado por versão**: o servidor é registrado como
      `npx -y @vibeharness/cli@<versão> mcp` — sem floating `latest`.
    - **Isolamento para testes/CI**: paths globais (Windsurf) respeitam a
      variável `VIBE_HOME` como âncora alternativa ao home real.

## Adaptadores declarativos

Cada cliente é uma entrada em `registry/clients.json` (detecção por globs,
arquivo de regras, formato do config MCP). Adicionar um cliente novo é
acrescentar JSON — nunca código.

---

[:octicons-arrow-left-24: Anterior: `status`](status.md){ .md-button }
[:octicons-arrow-right-24: Próximo: `prd`](prd.md){ .md-button .md-button--primary }
