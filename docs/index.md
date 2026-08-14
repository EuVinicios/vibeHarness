# VibeHarness 🛡️

**O harness de produção para desenvolvimento assistido por IA (vibecoding).**

Transforma desenvolvimento caótico com IA em engenharia **segura, auditável e conforme a LGPD** — com um único CLI que cobre o ciclo completo: antes, durante e depois do código.

---

## Para quem é

<div class="grid cards" markdown>

-   :bulb: **Para quem está começando**

    ---

    Não sabe por onde começar? Uma pergunta responde: o `start` detecta o estágio do seu projeto e executa os próximos passos com você.

    [:octicons-arrow-right-24: Guia por estágio](guia-por-estagio.md)

-   :rocket: **Para quem já está codando**

    ---

    Contexto sanitizado para a sua IA (sem vazar segredos), stack curada instalada automaticamente e regras de segurança ativas.

    [:octicons-arrow-right-24: Comandos](comandos/start.md)

-   :shield: **Para quem vai lançar**

    ---

    Auditoria 0–100 com prompts de correção prontos para colar na sua IA: segurança, LGPD, infra, acessibilidade.

    [:octicons-arrow-right-24: Segurança & LGPD](seguranca.md)

</div>

---

## Comece em 30 segundos

```bash
# No diretório do seu projeto:
npx @vibeharness/cli start
```

O `start` faz **uma única pergunta** — em qual estágio o projeto está — e então:

1. :mag: Detecta o que já existe (PRD, spec, stack, auditoria…)
2. :world_map: Mostra tudo o que o VibeHarness pode fazer por você
3. :arrow_forward: Executa o próximo passo recomendado — e o próximo — até o ciclo completar

??? tip "Prefere ver o menu completo primeiro?"
    Todos os comandos funcionam de forma independente:

    | Fase | Comando | O que faz |
    |------|---------|-----------|
    | :green_circle: Antes | [`prd`](comandos/prd.md) | Gera o documento de requisitos do produto |
    | :green_circle: Antes | [`init`](comandos/init.md) | Spec, regras de IA, hook anti-segredos, CI de segurança |
    | :green_circle: Antes | [`plan --apply`](comandos/plan.md) | Recomenda a stack **e já instala/configura tudo** |
    | :yellow_circle: Durante | [`pack`](comandos/pack.md) | Contexto limpo para a sua IA (segredos removidos) |
    | :red_circle: Depois | [`audit`](comandos/audit.md) | Auditoria 0–100 com prompts de correção |
    | :arrows_counterclockwise: Manutenção | [`doctor`](comandos/doctor.md) | Dependências, runtime EOL, Dependabot |

## O princípio

> **O VibeHarness não aponta o caminho — ele caminha com você.**

Cada recomendação do registro curado (as melhores ferramentas open-source por categoria, verificadas por licença, atividade e adoção) pode ser **aplicada automaticamente**: dependências instaladas, configs geradas, starters prontos — sem nunca editar o seu `src/` sem a sua revisão.

[:octicons-download-16: Instalação completa](instalacao.md){ .md-button .md-button--primary }
[:octicons-map-16: Guia por estágio](guia-por-estagio.md){ .md-button }
