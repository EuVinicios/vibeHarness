# Segurança & LGPD

O que você **precisa** cuidar antes de colocar qualquer projeto no ar —
e o que o VibeHarness já automatiza para você.

---

## Os 5 riscos que mais derrubam projetos de vibecoding

<div class="grid cards" markdown>

-   :key: **1. Segredos no código**

    ---

    Chave de API commitada = conta invadida em minutos.

    **O VibeHarness faz:** hook de pre-commit bloqueia 19+ padrões de segredo;
    scanner no `audit`; CI com gitleaks.

-   :syringe: **2. Prompt injection**

    ---

    Conteúdo de arquivos/issues manipulando a sua IA.

    **O VibeHarness faz:** todas as regras de IA geradas tratam conteúdo
    externo como DADO, nunca instrução; relatórios de audit são sanitizados.

-   :database: **3. Dados expostos**

    ---

    Sem RLS, qualquer usuário lê dados de outro.

    **O VibeHarness faz:** `audit` cobra RLS no Supabase/Postgres; regras de
    IA obrigam SQL parametrizado.

-   :credit_card: **4. Pagamentos sem verificação**

    ---

    Webhook sem assinatura verificada = créditos forjados.

    **O VibeHarness faz:** `plan --apply` instala o Stripe SDK com starter de
    webhook que verifica assinatura e usa idempotency keys.

-   :scales: **5. LGPD ignorada**

    ---

    Sem consentimento, páginas e endpoints de exclusão, o risco é legal.

    **O VibeHarness faz:** scanner LGPD dedicado (PII em logs, consentimento,
    DSR, hash de senha) + `LGPD_POLICY.md` gerado no `init`.

</div>

## Checklist LGPD (Brasil)

O scanner verifica automaticamente:

- [ ] Nada de PII em logs (`console.log` com CPF, e-mail, telefone, senha)
- [ ] Banner de consentimento de cookies (CookieYes, OneTrust, Cookiebot ou próprio)
- [ ] Páginas `/politica-de-privacidade` e `/termos-de-uso`
- [ ] Endpoints DSR — exclusão de conta (`DELETE /api/user`) e exportação de dados
- [ ] Row-Level Security ativo (Supabase/PostgreSQL)
- [ ] Hash de senha seguro — bcrypt/Argon2 (nunca MD5/SHA1)

!!! info "Escopo inteligente"
    Projetos CLI/biblioteca não são cobrados por obrigações web
    (banner de cookies, páginas de privacidade) — o scanner detecta a
    superfície do projeto antes de pontuar.

## E se a auditoria apontar algo "errado" que não é?

Nem todo alerta é um problema de verdade. Desde a v0.8, os scanners **classificam** cada
achado antes de pontuar, e o que for sabidamente inofensivo tem a pontuação
reduzida automaticamente — mas continua aparecendo no relatório, para você
ver:

| Classificação | O que significa, em linguagem simples | Exemplo |
|---------------|----------------------------------------|---------|
| `env-reference` | O valor é uma **referência** a uma variável, não o segredo em si | `API_KEY="$API_KEY"` |
| `fixture` | Placeholder óbvio de teste — **não é um segredo real** | `'server-secret'`, `'test-key'` |
| `ci-ephemeral` | Conexão de banco local ou de CI, descartável | `postgres:postgres@localhost` |
| `static-message` | Palavra sensível dentro de uma **mensagem de log**, sem dado pessoal | `console.log('senha inválida')` |

Se mesmo assim você tiver **arquivos que a auditoria sempre acusa e que você
sabe serem falsos positivos** (tipicamente: arquivos de teste com chaves
falsas de propósito), crie um arquivo `.vibe/auditignore` na raiz do projeto —
mesma sintaxe do `.gitignore` — listando esses caminhos. O `audit` deixa de
varrer o que estiver lá, sem esconder nada que você não tenha pedido.

!!! info "Precisão estrutural (v0.8.2)"
    CPF de 11 dígitos só pontua com **checksum válido** (IDs e timestamps
    nunca viram PII), telefone exige marcador BR ou separadores, f-strings
    Python entram na triagem dinâmica e **código comentado nunca satisfaz
    heurística** — logs, consentimento, páginas e rate limit.

!!! info "Acurácia de certificação (v0.8.3)"
    CPF **formatado** também exige checksum (números de lote param de pontuar),
    `INSERT … password` **multi-linha** é detectado, sites estáticos não são
    mais penalizados por healthcheck/rate-limit, DSR só pontua quando há
    persistência de dados, comentários em bloco/HTML/SQL/YAML nunca satisfazem
    heurística, e inputs com semântica própria (`hidden`/`submit`) não geram
    falso positivo de acessibilidade.

!!! tip "Como ler o score"
    O `audit` dá uma nota de **0 a 100**. A meta de lançamento é **≥ 70 e zero
    findings críticos** — é o que o CI do `init` exige para aprovar PRs.
    Achados `low` e `info` tiram pouco ou nada da nota; `high` tira muito.

## O ciclo de segurança recomendado

```text
init (fundação) → codar com regras ativas → pack (contexto sem segredos)
      → audit --report (score ≥ 70) → corrigir → doctor (manutenção)
```

| Momento | Ferramenta ativa |
|---------|------------------|
| Ao commitar | Hook de pre-commit (segredos) |
| A cada PR | CI: gitleaks + CVE audit + gate de score |
| Antes de lançar | `audit --report` completo |
| Continuamente | Dependabot (gerado pelo `doctor --fix`) |

!!! info "CI pinado de ponta a ponta"
    No `security.yml` que o `init` instala no seu projeto, todas as actions de
    terceiros são pinadas por **SHA completo** (verificadas contra as tags na
    GitHub API) e o próprio VibeHarness roda na **versão que gerou o arquivo**
    — nunca `latest`. Um pacote comprometido no npm não vira execução no seu CI.

!!! quote "Constituição do projeto"
    Toda instalação do `init` gera `.vibe/CONSTITUTION.md` — as **7 leis**
    inegociáveis que a sua IA é obrigada a seguir (segurança, segredos fora do
    código, validação de entrada, migrations, testes críticos, higiene de
    dependências e acessibilidade WCAG 2.1 AA). Leia uma vez; o resto é automático.

---

[:octicons-arrow-left-24: Anterior: `doctor`](comandos/doctor.md){ .md-button }
[:octicons-home-16: Início](index.md){ .md-button }
