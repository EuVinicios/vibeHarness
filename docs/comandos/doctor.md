# `doctor` — manutenção contínua

Impede o projeto de apodrecer: dependências, runtime e automação.

```bash
npx @vibeharness/cli doctor          # só o relatório
npx @vibeharness/cli doctor --fix    # + gera .github/dependabot.yml
npx @vibeharness/cli doctor --json   # checks estruturados (agentes/CI)
```

---

## O que é verificado

- :hourglass_flowing_sand: **Runtime** — Node.js em EOL, com orientação de upgrade
- :lock: **Reprodutibilidade** — presença de lockfile
- :chart_with_upwards_trend: **Drift de dependências** — `npm outdated`, majors em destaque
- :robot: **Automação** — Dependabot configurado com `--fix`
- :octicon-shield-check: **Postura no GitHub** (com `gh` instalado) — secret
  scanning, push protection e branch protection do repositório

## Rotina recomendada

| Frequência | Ação |
|-----------|------|
| Semanal | `doctor` rápido |
| Mensal | `doctor --fix` + aplicar bumps com testes |
| Ao ver alerta de CVE | Atualizar a dependência e rodar [`audit`](audit.md) |

---

[:octicons-arrow-left-24: Anterior: `audit`](audit.md){ .md-button }
[:octicons-arrow-right-24: Segurança & LGPD](../seguranca.md){ .md-button .md-button--primary }
