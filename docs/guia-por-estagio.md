# Guia por estágio

Uma pergunta define tudo: **em qual estágio o seu projeto está?**
Este guia mostra o que fazer em cada um — ou deixe o [`start`](comandos/start.md) fazer por você:

```bash
npx @vibeharness/cli start
```

---

## :bulb: Ideia — ainda não comecei a codar

**Objetivo:** transformar a ideia em especificação antes de gastar tokens.

| Ordem | Ação | Por quê |
|------:|--------|---------|
| 1 | [`prd`](comandos/prd.md) | Definir problema, personas, MVP e o que fica FORA do escopo |
| 2 | [`init`](comandos/init.md) | Criar spec, constituição e responder o modelo de ameaça |
| 3 | [`plan --apply`](comandos/plan.md) | Escolher a stack curada e já sair com ela instalada |

!!! tip "Erro clássico do vibecoder"
    Começar a codar sem PRD. A IA "inventa" requisitos, você muda de ideia,
    e o retrabalho custa caro. 10 minutos de `prd` economizam dias.

## :hammer_and_wrench: Começando — projeto (quase) vazio

**Objetivo:** fundação segura desde o primeiro commit.

| Ordem | Ação | Por quê |
|------:|--------|---------|
| 1 | [`init`](comandos/init.md) | Hook anti-segredos e regras de IA antes do primeiro código |
| 2 | [`prd`](comandos/prd.md) | Requisitos claros para a IA seguir |
| 3 | [`plan --apply`](comandos/plan.md) | Validação, testes, banco e auth já configurados |

## :keyboard: Codando — desenvolvimento ativo

**Objetivo:** manter a IA com contexto bom e o projeto dentro dos trilhos.

| Ordem | Ação | Por quê |
|------:|--------|---------|
| 1 | Complete o que falta | O `start` mostra exatamente o que está pendente |
| 2 | [`pack`](comandos/pack.md) | Antes de sessões longas com a IA: contexto limpo, sem segredos |
| 3 | [`audit`](comandos/audit.md) | Rode de tempos em tempos para não acumular dívida |

!!! tip "Rotina recomendada"
    `pack` no início da sessão de trabalho → código com a IA → `audit` antes de cada PR.

## :rocket: Lançando — revisão final antes de produção

**Objetivo:** score ≥ 70, sem findings críticos.

| Ordem | Ação | Por quê |
|------:|--------|---------|
| 1 | [`audit --report`](comandos/audit.md) | Scorecard completo + prompts de correção para a IA |
| 2 | Corrija os findings | Cole cada *AI Fix Prompt* na sua IA, comece pelos críticos |
| 3 | [`doctor --fix`](comandos/doctor.md) | Dependabot ativo antes do lançamento |
| 4 | Re-rode o `audit` | Até passar no gate (≥ 70, zero críticos) |

!!! warning "Checklist de lançamento"
    - [ ] Score ≥ 70 e nenhum finding crítico
    - [ ] Segredos apenas em variáveis de ambiente
    - [ ] RLS ativo em todas as tabelas (Supabase/Postgres)
    - [ ] Webhooks de pagamento com verificação de assinatura
    - [ ] Política de privacidade e termos publicados (LGPD)

## :wrench: Produção — manutenção

**Objetivo:** não deixar o projeto apodrecer.

| Frequência | Ação |
|-----------|------|
| Semanal | [`doctor`](comandos/doctor.md) — dependências desatualizadas, runtime EOL |
| A cada PR | O CI roda o `audit` automaticamente (instalado pelo `init`) |
| Mensal | [`audit --report`](comandos/audit.md) para revisão completa |
| Ao mudar de stack | [`plan --apply`](comandos/plan.md) para reavaliar recomendações |

---

## O ciclo completo, visualmente

```text
  ┌────────────┐    ┌────────────┐    ┌─────────────────┐
  │  prd       │ →  │  init      │ →  │  plan --apply   │
  │ requisitos │    │ fundação   │    │ stack instalada │
  └────────────┘    └────────────┘    └────────┬────────┘
                                               ↓
  ┌────────────┐    ┌────────────┐    ┌─────────────────┐
  │  doctor    │ ←  │  audit     │ ←  │  pack           │
  │ manutenção │    │ score 0–100│    │ contexto p/ IA  │
  └────────────┘    └────────────┘    └─────────────────┘
```

<div class="grid" markdown>

[:octicons-download-16: **Instalação**](instalacao.md){ .md-button }

[:octicons-command-palette-16: **Comando start**](comandos/start.md){ .md-button .md-button--primary }

</div>
