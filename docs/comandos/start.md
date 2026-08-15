# `start` — fluxo guiado (deprecado)

!!! warning "Deprecado desde a v0.7.0"
    O cockpit interativo (loop de teclas) foi aposentado. O caminho
    recomendado agora é:

    - **[`install`](install.md)** — registra o harness na sua IA (MCP) e deixa
      ela orquestrar o ciclo inteiro;
    - **[`status`](status.md)** — painel não-interativo com o próximo passo e
      o prompt pronto.

    O `start` continua funcionando por um release para quem só usa terminal:
    ele pergunta a fase, mostra o mapa do ciclo e executa os passos com
    confirmação.

```bash
npx @vibeharness/cli start         # fluxo guiado (aviso de deprecação)
npx @vibeharness/cli start --yes   # infere a fase e mostra o próximo passo
npx @vibeharness/cli status        # substituto recomendado
```

---

[:octicons-arrow-left-24: Anterior: `doctor`](doctor.md){ .md-button }
[:octicons-arrow-right-24: Voltar ao início](../index.md){ .md-button .md-button--primary }
