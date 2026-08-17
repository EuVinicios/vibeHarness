import { renderNextStepBox, renderContinuousWorkflowBox } from '../src/ui/next-step.js';

describe('renderNextStepBox', () => {
  it('renders box with action summary, next step title, chat prompt, and cli command', () => {
    const output = renderNextStepBox({
      currentActionSummary: 'Fundação inicializada (.vibe/)',
      nextStepTitle: '2. Especificação do Produto',
      nextStepDescription: 'Criação do PRD',
      chatPrompt: 'Chat, crie o PRD',
      cliCommand: 'npx @vibeharness/cli prd',
    });

    expect(output).toContain('O QUE FAZER AGORA');
    expect(output).toContain('Concluído:');
    expect(output).toContain('Fundação inicializada (.vibe/)');
    expect(output).toContain('Próximo Passo:');
    expect(output).toContain('2. Especificação do Produto');
    expect(output).toContain('Chat, crie o PRD');
    expect(output).toContain('npx @vibeharness/cli prd');
    expect(output).toContain('npx @vibeharness/cli status');
  });

  it('can hide status hint if requested', () => {
    const output = renderNextStepBox({
      nextStepTitle: 'Ação única',
      cliCommand: 'npx @vibeharness/cli audit',
      showStatusHint: false,
    });

    expect(output).toContain('Ação única');
    expect(output).not.toContain('Ver painel de saúde e progresso');
  });
});

describe('renderContinuousWorkflowBox', () => {
  it('renders continuous workflow card for completed lifecycle', () => {
    const output = renderContinuousWorkflowBox();

    expect(output).toContain('DESENVOLVIMENTO CONTÍNUO');
    expect(output).toContain('Construa Features:');
    expect(output).toContain('Valide Prontidão:');
    expect(output).toContain('Mantenha Dependências:');
    expect(output).toContain('npx @vibeharness/cli audit --site');
    expect(output).toContain('npx @vibeharness/cli doctor --fix');
  });
});
