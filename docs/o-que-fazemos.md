# O que fazemos por você

O VibeHarness responde às duas perguntas que todo vibecoder enfrenta:
**"o que eu faço agora?"** e **"meu código está pronto para produção?"**

E a regra da casa é uma só: **nunca apenas apontar o caminho — executar**.
Cada recomendação vira ação: documentos gerados, dependências instaladas,
configs criadas, auditoria com correção pronta para colar na sua IA.
Tudo 100% local — nada do seu projeto sai da sua máquina.

---

## Com VibeHarness vs. no modo caos

| No modo caos :see_no_evil: | Com o VibeHarness :sparkles: |
|---|---|
| A IA inventa requisitos, você retrabalha | [`prd`](comandos/prd.md) gera requisitos, personas e escopo **antes** do primeiro token de código |
| Stack escolhida no hype ou no chute | [`plan --apply`](comandos/plan.md) recomenda do registro curado **e já instala e configura** |
| Chave de API commitada sem perceber | Bloqueada em 3 camadas: [pre-commit, auditoria e CI](seguranca.md) |
| Contexto da IA vazando segredos | [`pack`](comandos/pack.md) redige chaves, tokens e PEMs automaticamente |
| "Acho que dá para lançar" | [`audit`](comandos/audit.md) responde com **score 0–100** e gate de CI |
| Projeto apodrece depois do lançamento | [`doctor`](comandos/doctor.md) vigia runtime EOL, deps e Dependabot |

---

## Como melhoramos o seu código

<div class="grid cards" markdown>

-   :memo: **Requisitos antes de código**

    ---

    PRD com personas, MVP, métricas e o que fica **fora** do escopo —
    a IA para de inventar e você para de retrabalhar.

-   :package: **A stack certa, já instalada**

    ---

    Registro curado (melhores ferramentas por categoria, verificadas por
    licença, atividade e adoção). O `--apply` instala dependências, gera
    configs de validação, testes e migrations, e escreve starters em
    `.vibe/starters/` — **sem nunca editar o seu `src/`**.

-   :robot: **Regras que a sua IA obedece**

    ---

    `init` instala regras para Claude, Cursor, Windsurf, Copilot e afins:
    validação com schema em todo input, SQL parametrizado, TDD em rotas
    críticas, nada de `curl | sh`.

-   :broom: **Higiene contínua**

    ---

    A auditoria cobra o que degrada código rápido: god objects,
    `console.log` esquecido, código morto — com prompt de correção
    para cada finding.

</div>

---

## Como tornamos o seu código seguro

Segurança em **camadas**, cada uma cobrindo um momento diferente do ciclo:

| Camada | Quando age | O que bloqueia |
|--------|-----------|----------------|
| :octicons-git-commit-24: **Pre-commit hook** | A cada commit | 19+ padrões de segredo (AWS, Stripe, GitHub, OpenAI, JWT, PEM…) |
| :octicons-robot-24: **Regras de IA** | Enquanto você coda | Prompt injection, segredos hardcoded, SQL interpolado, RLS ausente |
| :octicons-shield-check-24: **CI de segurança** | A cada PR | gitleaks + CVEs (`npm audit`) + gate de score — PR ruim não entra |
| :octicons-gauge-24: **Auditoria 0–100** | Antes de lançar | 7 seções: segredos, CVEs, LGPD, higiene, banco, infra, acessibilidade |
| :octicons-heart-pulse-24: **Doctor** | Continuamente | Runtime EOL, dependências vulneráveis, Dependabot ativo |

!!! example "Exemplo concreto: o finding já vem com a solução"
    A auditoria encontra um JWT com `alg: none`. Em vez de só apontar,
    o relatório entrega o **AI Fix Prompt** — você cola na sua IA e o
    problema é corrigido na hora. Para os críticos, há um prompt em
    lote que resolve todos de uma vez.

### O que o scanner LGPD garante (Brasil :flag-br:)

Nada de PII em logs, banner de consentimento, páginas de privacidade e
termos, endpoints de exclusão/exportação de dados (DSR), Row-Level
Security e hash de senha forte. [Detalhes na página de Segurança](seguranca.md).

---

## Tudo o que entregamos no seu projeto

O ciclo completo (`prd → init → plan --apply → pack → audit → doctor`) deixa
o seu projeto com:

```text
.vibe/
├── PRD.md               ← requisitos que a IA lê antes de codar
├── SPEC.md              ← especificação técnica
├── CONSTITUTION.md      ← leis inegociáveis de arquitetura e segurança
├── LGPD_POLICY.md       ← checklist de conformidade
├── STACK.md             ← decisões de stack + trilha de auditoria do --apply
├── threat-model.json    ← modelo de ameaça estruturado
├── CONTEXT.md           ← contexto sanitizado para a sua IA
└── starters/            ← código inicial gerado, pronto para incorporar

CLAUDE.md / .cursorrules / .windsurfrules / AGENTS.md   ← regras de IA
.github/workflows/security.yml                          ← gate de segurança no CI
.git/hooks/pre-commit                                   ← bloqueio de segredos
.env.example                                            ← variáveis necessárias, sem valores
AUDIT_REPORT.md + .vibe/report/                         ← scorecard + relatório visual
```

!!! success "Nada sai da sua máquina"
    O VibeHarness roda 100% localmente. O registro curado é um snapshot
    dentro do pacote — nenhum dado do seu projeto é enviado para fora.

---

<div class="grid" markdown>

[:octicons-home-16: Início](index.md){ .md-button }

[:octicons-download-16: **Instalar e experimentar**](instalacao.md){ .md-button .md-button--primary }

[:octicons-shield-16: Segurança & LGPD](seguranca.md){ .md-button }

</div>
