# VibeHarness 🛡️

**O harness de produção para desenvolvimento assistido por IA (vibecoding).**

Transforma desenvolvimento caótico com IA em engenharia **segura, auditável e conforme a LGPD** — com um único CLI que cobre o ciclo completo: antes, durante e depois do código.

---

## Para quem é

<div class="grid cards" markdown>

-   :bulb: **Para quem está começando**

    ---

    Não sabe por onde começar? O Conductor detecta o estágio do seu projeto, mostra o caminho e entrega prompts prontos para a sua IA.

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
# No diretório do seu projeto — sem argumentos:
npx @vibeharness/cli
```

O **Conductor Interativo** abre o cockpit do projeto e conduz o ciclo:

1. :airplane: **Mostra onde você está** — fase do projeto, score de prontidão e a próxima meta em duas frases amigáveis
2. :content_copy: **Entrega o prompt pronto** — missão + critérios de aceite + leis da Constitution, copiado para o clipboard com `Enter`
3. :zap: **Valida em milissegundos** — aperte `V` depois que a sua IA gerar o código; se falhar, o prompt de correção já está pronto

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

## Tudo o que fazemos por você

<div class="grid cards" markdown>

-   :zap: **Executamos, não apontamos**

    ---

    Stack recomendada é stack **instalada e configurada** (`plan --apply`).
    Documento de requisitos é documento **gerado** (`prd`). Nada de lista de links.

-   :keyboard: **Zero chaves de API**

    ---

    O Conductor não consome IA — ele governa: prepara o contexto, gera o
    prompt cirúrgico para você colar na **sua** IA e valida o resultado localmente.

-   :lock: **Segurança em 5 camadas**

    ---

    Pre-commit hook, regras de IA, gate de CI com gitleaks + CVEs,
    auditoria 0–100 e doctor contínuo. Cada camada cobre um momento do ciclo.

-   :scales: **LGPD desde o início**

    ---

    Scanner dedicado (PII em logs, consentimento, DSR, RLS, hash de senha)
    + política de conformidade gerada no `init`.

-   :robot: **Correção pronta para a sua IA**

    ---

    Cada finding da auditoria vem com um **AI Fix Prompt** para colar
    no Cursor, Claude ou Copilot — inclusive um prompt em lote para os críticos.

</div>

[:octicons-eye-16: Ver tudo em detalhes](o-que-fazemos.md){ .md-button .md-button--primary }

---

## O princípio

> **O VibeHarness não aponta o caminho — ele caminha com você.**

Cada recomendação do registro curado (as melhores ferramentas open-source por categoria, verificadas por licença, atividade e adoção) pode ser **aplicada automaticamente**: dependências instaladas, configs geradas, starters prontos — sem nunca editar o seu `src/` sem a sua revisão.

[:octicons-download-16: Instalação completa](instalacao.md){ .md-button .md-button--primary }
[:octicons-map-16: Guia por estágio](guia-por-estagio.md){ .md-button }
