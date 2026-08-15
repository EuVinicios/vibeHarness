# VibeHarness 🛡️

**O harness de produção para desenvolvimento assistido por IA (vibecoding).**

Transforma desenvolvimento caótico com IA em engenharia **segura, auditável e conforme a LGPD** — com um único CLI que cobre o ciclo completo: antes, durante e depois do código.

---

## Para quem é

<div class="grid cards" markdown>

-   :bulb: **Para quem está começando**

    ---

    Um comando registra o harness na sua IA — ela pergunta, planeja e executa o ciclo. Você só conversa.

    [:octicons-arrow-right-24: Usando com a sua IA](usando-com-sua-ia.md)

-   :rocket: **Para quem já está codando**

    ---

    Contexto sanitizado para a sua IA (sem vazar segredos), stack curada instalada automaticamente e regras de segurança ativas.

    [:octicons-arrow-right-24: Comandos](comandos/status.md)

-   :shield: **Para quem vai lançar**

    ---

    Auditoria 0–100 com prompts de correção prontos para colar na sua IA: segurança, LGPD, infra, acessibilidade.

    [:octicons-arrow-right-24: Segurança & LGPD](seguranca.md)

</div>

---

## Comece em 30 segundos

```bash
# No diretório do seu projeto:
npx @vibeharness/cli install
```

Escolha o seu cliente de IA, reinicie, aprove o servidor MCP — e converse:

1. :robot: **A IA pergunta no chat** — PRD, threat model, tipo de projeto (nada de decorar comandos)
2. :hammer_and_wrench: **A IA executa o ciclo** — `prd → plan --apply → pack → audit`, instalando a stack curada e integrando os starters com o seu consentimento
3. :zap: **A IA corrige a si mesma** — roda a auditoria, aplica o fix prompt sanitizado e re-audita até passar

??? tip "Prefere o terminal?"
    Todos os comandos funcionam de forma independente (e aceitam `--json`):

    | Fase | Comando | O que faz |
    |------|---------|-----------|
    | :compass: Sempre | [`status`](comandos/status.md) | Painel: fase, ciclo, score + prompt pronto |
    | :robot: Sempre | [`install`](comandos/install.md) | Registra o harness no seu cliente de IA |
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

    O VibeHarness não consome IA — ele governa: prepara o contexto, entrega
    tools MCP para a **sua** IA orquestrar o ciclo e valida o resultado localmente.

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
[:octicons-package-16: Ferramentas validadas](ferramentas-validadas.md){ .md-button }

---

## O princípio

> **O VibeHarness não aponta o caminho — ele caminha com você.**

Cada recomendação do registro curado (as melhores ferramentas open-source por categoria, verificadas por licença, atividade e adoção) pode ser **aplicada automaticamente**: dependências instaladas, configs geradas, starters prontos — sem nunca editar o seu `src/` sem a sua revisão.

[:octicons-download-16: Instalação completa](instalacao.md){ .md-button .md-button--primary }
[:octicons-map-16: Guia por estágio](guia-por-estagio.md){ .md-button }
