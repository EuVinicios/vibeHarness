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

!!! quote "Constituição do projeto"
    Toda instalação do `init` gera `.vibe/CONSTITUTION.md` — as leis
    inegociáveis que a sua IA é obrigada a seguir. Leia uma vez; o resto é automático.

---

[:octicons-arrow-left-24: Anterior: `doctor`](comandos/doctor.md){ .md-button }
[:octicons-home-16: Início](index.md){ .md-button }
