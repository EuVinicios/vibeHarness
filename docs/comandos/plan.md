# `plan --apply` — stack curada, instalada de verdade

Responde à pergunta de todo vibecoder — *"qual stack eu uso?"* — **e já deixa tudo instalado e configurado**.

```bash
npx @vibeharness/cli plan                 # só a recomendação (.vibe/STACK.md)
npx @vibeharness/cli plan --apply         # recomenda + instala + configura
npx @vibeharness/cli plan --type saas     # fullstack-web | api | landing | saas
npx @vibeharness/cli plan --yes --force   # non-interativo, sobrescreve
```

---

## A diferença: o VibeHarness *faz*, não só *aponta*

O registro curado (`registry/catalog.json`) traz as melhores ferramentas por
categoria — verificadas por licença (OSI), atividade e adoção da comunidade.
Com `--apply`, o CLI:

1. :package: **Instala** as dependências primárias com o seu gerenciador
   (npm, yarn, pnpm ou bun — detectado pelo lockfile)
2. :gear: **Gera configs** iniciais seguras (validação, testes, banco, MCP)
3. :file_folder: **Cria starters** em `.vibe/starters/` — nunca edita o seu `src/`
4. :thread: **Escreve o guia de integração** em `.vibe/starters/README.md` —
   um checklist por starter; a sua IA integra com o seu consentimento e o
   [`status`](status.md) cobra os passos pendentes
5. :key: **Monta o `.env.example`** com as variáveis necessárias (sem valores reais)
6. :memo: **Registra a trilha** do que foi aplicado no final do `STACK.md`

## O que é aplicado por categoria

| Categoria | O que acontece |
|-----------|----------------|
| Validação | Zod/Valibot/Yup instalado + starter de schema |
| Banco de dados | Supabase/Prisma/Drizzle instalado + config de migrations + `.env.example` |
| Autenticação | Better Auth/Auth.js instalado + starter seguro + `AUTH_SECRET` no `.env.example` |
| Pagamentos | Stripe SDK + starter de webhook **com verificação de assinatura** |
| Testes | Vitest instalado + config + teste de exemplo |
| Segurança | CI gate (gitleaks + CVE) + instalação dos binários (com o seu consentimento) |
| MCP | `.mcp.json` configurado com servidores MCP curados |

!!! info "O que continua sendo recomendação"
    Frameworks de frontend/backend (Next.js, Fastify…) e plataformas de deploy
    exigem decisões estruturais do projeto — o `STACK.md` recomenda, você decide.

!!! warning "Ferramentas de sistema pedem consentimento"
    Binários como gitleaks e osv-scanner só são instalados (via Homebrew) se
    você confirmar no prompt. Em modo `--yes`, são pulados com instruções.

---

[:octicons-arrow-left-24: Anterior: `init`](init.md){ .md-button }
[:octicons-arrow-right-24: Próximo: `pack`](pack.md){ .md-button .md-button--primary }
