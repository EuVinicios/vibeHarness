# `status` — onde estou, qual o próximo passo

Painel não-interativo (comando padrão desde a v0.7): fase do projeto, ciclo de
vida, score cacheado, checklist de starters e um **prompt pronto** para colar
na sua IA.

```bash
npx @vibeharness/cli status          # painel bonito no terminal
npx @vibeharness/cli status --json   # mesmo dado em JSON (agentes/CI)
```

---

## O que aparece

- **Fase inferida** — idea / starting / building / shipping / production
- **Ciclo de vida** — ✔ concluído, ★ recomendado agora, ○ pendente:
  `init → prd → plan --apply → pack → audit → doctor`
- **Score** — da última auditoria (cache de 24h em `.vibe/.audit-cache.json`)
- **Starters pendentes** — se `plan --apply` deixou `.vibe/starters/` sem integrar
- **Prompt pronto** — a missão do próximo passo com critérios de aceite e as
  leis da Constitution (ou o prompt de integração dos starters, quando é isso
  que falta)

## Modo IA

Com o MCP instalado ([`install`](install.md)), a tool `vibe_status` entrega o
mesmo dado estruturado — a sua IA sabe sozinha o que falta e executa o próximo
passo. O painel existe para quem prefere terminal ou está sem MCP.

---

[:octicons-arrow-right-24: Próximo: `install`](install.md){ .md-button .md-button--primary }
