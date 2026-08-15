# `start` — o Conductor Interativo

> **O cockpit do vibecoder.** Zero chaves de API, zero decorar sequência —
> o VibeHarness conduz, você aperta uma tecla.

```bash
npx @vibeharness/cli              # abre o Conductor (comando padrão)
npx @vibeharness/cli start        # idêntico ao comando acima
npx @vibeharness/cli start --yes  # sem interação: infere o estágio e executa
```

!!! info "Sem terminal interativo?"
    Em CI, pipes ou `--yes`, o Conductor abre caminho automaticamente para o
    fluxo guiado clássico: **uma pergunta** sobre o estágio, mapa do ciclo e
    execução passo a passo com confirmação.

---

## O cockpit

Ao abrir, o Conductor lê o estado do repositório e renderiza o painel:

```text
╭──────────────────────────────────────────────────────────────────╮
│ 🛡️  VIBEHARNESS · Production Conductor v0.6.0                    │
│ 📦 Projeto: meu-saas │ Fase: 💻 BUILDING │ Score: 85/100 🏆 [B] │
╰──────────────────────────────────────────────────────────────────╯

╭─ 🧭 Onde você está ──────────────────────────────────────────────╮
│ Código fluindo 💻 — o harness agora foca em defesa e qualidade…  │
╰──────────────────────────────────────────────────────────────────╯

╭─ 📋 Prompt pronto · Escrever o PRD ──────────────────────────────╮
│ 🛡️ VibeHarness · Prompt Cirúrgico — Escrever o PRD do produto    │
│ …                                                                │
╰──────────────────────────────────────────────────────────────────╯

  [↵ Enter] 📋 Copiar Prompt │ [V] ⚡ Validar Código │ [A] 📊 Ver Auditoria
  [N] ▶️ Executar Próxima Etapa │ [Q] 🚪 Sair
```

O **Score** do cabeçalho vem de um cache local (`.vibe/.audit-cache.json`,
válido por 24h) — na primeira abertura ele é medido uma vez e atualizado a
cada validação.

## O loop fechado

| Tecla | Ação | O que acontece |
|-------|------|----------------|
| :material-keyboard-return: `↵ Enter` | :content_copy: **Copiar prompt** | O prompt cirúrgico da etapa atual vai para o clipboard — cole no Cursor, Claude Code, Windsurf, Copilot, ChatGPT… |
| `V` | :zap: **Validar código** | Roda os scanners locais em milissegundos e atualiza o score |
| `A` | :chart-bar: **Ver auditoria** | Scorecard completo dos 7 pilares, com grades A–F |
| `N` | :arrow_forward: **Próxima etapa** | Executa o próximo passo do ciclo (`prd → init → plan --apply → pack → audit → doctor`) |
| `Q` | :door: **Sair** | Encerra — o estado fica salvo, o Conductor retoma de onde parou |

### O ciclo de trabalho com a sua IA

```text
Enter (copia prompt) → cola na sua IA → IA gera o código
       ↑                                        ↓
       └── Enter (copia prompt de correção) ← V (valida)
                                                ↓
                                  ✅ passou? Score sobe, próxima etapa
```

- **Falhou?** Os findings aparecem com linguagem amigável — cada um com
  correção mapeada — e o `Enter` passa a copiar o **prompt de correção**
  cobrindo todos os críticos/altos de uma vez.
- **Passou?** Animação de sucesso, score atualizado e o Conductor avança
  para a próxima meta.

## O prompt cirúrgico

Cada prompt gerado pelo Conductor embute:

1. :target: **Missão** — o objetivo da etapa atual
2. :clipboard-check: **Critérios de aceite** — como saber que terminou certo
3. :scale-balanced: **Leis da Constitution** — as regras não-negociáveis
   extraídas de `.vibe/CONSTITUTION.md`
4. :file-tree: **Ponteiros de contexto** — PRD, SPEC, STACK e threat model
   (apenas os que existem no seu projeto)
5. :shield: **Regras de engajamento** — mudança mínima, tratamento anti
   prompt-injection, lista de arquivos alterados

Tudo que vem de arquivos passa pela mesma sanitização anti-injection do
relatório de auditoria.

!!! tip "Clipboard indisponível?"
    Sem `pbcopy`/`wl-copy`/`xclip`/`clip`? O prompt é salvo em
    `.vibe/prompt-last.txt` e o Conductor avisa o caminho — nada se perde.

!!! tip "Dentro da sua IA"
    O `init` instala o slash command `/start` no Claude Code. Se a sua IA
    estiver perdida, diga apenas: *"rode o /start"*.

---

[:octicons-arrow-left-24: Instalação](../instalacao.md){ .md-button }
[:octicons-arrow-right-24: Próximo comando: `prd`](prd.md){ .md-button .md-button--primary }
