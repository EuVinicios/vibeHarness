# `pack` — contexto sanitizado para a IA

Gera `.vibe/CONTEXT.md`: o projeto inteiro, limpo e seguro, pronto para colar
na sua IA ou anexar como contexto do agente.

```bash
npx @vibeharness/cli pack
npx @vibeharness/cli pack --include-tests
npx @vibeharness/cli pack --exclude "e2e/**,fixtures/**"
npx @vibeharness/cli pack --output contexto.md
```

---

## O que sai automaticamente

- :no_entry: **Arquivos sensíveis:** todos os `.env*`, `*.pem`, `*.key`,
  `id_rsa*`, `*.tfstate`, credenciais
- :no_entry: **Ruído:** `node_modules/`, `dist/`, `build/`, binários
- :secret: **Segredos no meio do código:** o trecho exato virando `[REDACTED]`
  (tokens, chaves, PEMs multilineares, `KEY=value`, URIs de conexão)

## O que entra

- Resumo de arquitetura do `SPEC.md` e `CONSTITUTION.md`
- Código-fonte formatado com tags de linguagem

!!! warning "Revisão antes de compartilhar"
    A redação é best-effort. Sempre abra o `.vibe/CONTEXT.md` antes de colar
    em serviços externos — e nunca o publique.

## Quando usar

- No início de uma sessão longa com a IA
- Ao trocar de ferramenta de IA
- Antes de pedir uma revisão de arquitetura completa

---

[:octicons-arrow-left-24: Anterior: `plan`](plan.md){ .md-button }
[:octicons-arrow-right-24: Próximo: `audit`](audit.md){ .md-button .md-button--primary }
