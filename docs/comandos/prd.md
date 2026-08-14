# `prd` — requisitos do produto

Gera `.vibe/PRD.md`: a fonte de verdade que a sua IA lê **antes** de codar.

```bash
npx @vibeharness/cli prd           # questionário interativo
npx @vibeharness/cli prd --yes     # PRD com placeholders para preencher depois
npx @vibeharness/cli prd --force   # sobrescreve um PRD.md existente
```

---

## O que o PRD contém

- Problema e personas
- User stories com prioridade e status
- Funcionalidades do MVP e métricas de sucesso
- **Fora de escopo** — explícito, para a IA não inventar
- Requisitos não-funcionais (segurança, LGPD, performance, WCAG)
- Definition of Done ligada ao score do [`audit`](audit.md)

## Por que isso importa

!!! failure "Sem PRD"
    A IA inventa requisitos, você muda de ideia, o código diverge do que você
    queria. Cada iteração custa tokens e tempo.

!!! success "Com PRD"
    A IA trabalha contra uma especificação estável. Mudanças de escopo viram
    edições no documento — não retrabalho no código.

---

[:octicons-arrow-left-24: Anterior: `start`](start.md){ .md-button }
[:octicons-arrow-right-24: Próximo: `init`](init.md){ .md-button .md-button--primary }
