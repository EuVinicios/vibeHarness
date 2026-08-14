# `start` — fluxo guiado

> **O ponto de partida para todo vibecoder.** Uma pergunta, e o VibeHarness
> assume o volante.

```bash
npx @vibeharness/cli start
npx @vibeharness/cli start --yes   # sem prompts: infere o estágio e executa
```

---

## Como funciona

1. :mag: **Detecta** o estado do projeto — arquivos `.vibe/`, lockfile,
   relatório de auditoria, Dependabot, hook de pre-commit
2. :question: **Pergunta uma vez:** *"Em qual estágio o seu projeto está?"*

    | Resposta | Quando escolher |
    |----------|-----------------|
    | :bulb: Ideia | Ainda não escrevi código |
    | :hammer_and_wrench: Começando | Projeto novo ou quase vazio |
    | :keyboard: Codando | Desenvolvimento ativo |
    | :rocket: Lançando | Revisão final antes de produção |
    | :wrench: Produção | Já está no ar, modo manutenção |

3. :world_map: **Mostra o mapa** — tudo o que o VibeHarness pode fazer, com
   o que está pronto (✔), o que falta (○) e o próximo passo recomendado (★)
4. :arrow_forward: **Executa** cada passo com a sua confirmação, até o ciclo
   completar

## O que ele roda por você

O `start` orquestra os outros comandos na ordem certa para o seu estágio:

- `prd`, `init`, `plan --apply`, `pack`, `audit --report`, `doctor --fix`

Você nunca precisa decorar a sequência.

!!! tip "Dentro da sua IA"
    O `init` instala o slash command `/start` no Claude Code. Se a sua IA
    estiver perdida, diga apenas: *"rode o /start"*.

---

[:octicons-arrow-left-24: Instalação](../instalacao.md){ .md-button }
[:octicons-arrow-right-24: Próximo comando: `prd`](prd.md){ .md-button .md-button--primary }
