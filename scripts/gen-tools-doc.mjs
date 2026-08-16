#!/usr/bin/env node
/**
 * Generates docs/ferramentas-validadas.md from registry/catalog.json, the
 * apply recipes and the CLI's own dependencies — the single source of truth
 * for "which tools VibeHarness actually uses". Re-run after every registry
 * sync or dependency change:
 *
 *   npm run build && node scripts/gen-tools-doc.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const catalog = JSON.parse(await readFile(join(root, 'registry', 'catalog.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const { APPLY_RECIPES } = await import(pathToFileURL(join(root, 'dist', 'core', 'recipes.js')).href);

const CATEGORY_TITLES = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Banco de dados',
  auth: 'Autenticação',
  payments: 'Pagamentos',
  validation: 'Validação de entrada',
  testing: 'Testes',
  deploy: 'Deploy / Hospedagem',
  mcp: 'Servidores MCP',
  'ai-tools': 'Ferramentas de desenvolvimento com IA',
  security: 'Segurança',
  maintenance: 'Manutenção de dependências',
};

const RECIPE_ACTION = {
  'colinhacks/zod': 'instala `zod` + starter de schema',
  'fabian-hiller/valibot': 'instala `valibot` + starter de schema',
  'jquense/yup': 'instala `yup` + starter de schema',
  'vitest-dev/vitest': 'instala `vitest` + config + teste de exemplo',
  'jestjs/jest': 'instala `jest` (config por conta do projeto)',
  'microsoft/playwright': 'instala `@playwright/test` + config de E2E',
  'supabase/supabase': 'instala `@supabase/supabase-js` + cliente starter + env vars',
  'prisma/prisma': 'instala Prisma + schema starter + env vars',
  'drizzle-team/drizzle-orm': 'instala Drizzle + config + schema starter + env vars',
  'better-auth/better-auth': 'instala `better-auth` + starter + env vars',
  'nextauthjs/next-auth': 'instala `next-auth` + starter + env vars',
  'stripe/stripe-node': 'instala `stripe` + webhook starter (verificação de assinatura) + env vars',
  'gitleaks/gitleaks': 'binário de sistema (Homebrew, com consentimento) — scan de segredos',
  'google/osv-scanner': 'binário de sistema (Homebrew, com consentimento) — CVEs multi-ecossistema',
  'modelcontextprotocol/servers': 'escreve `.mcp.json` com servidores MCP curados e **pinados por versão**',
  'coollabsio/coolify': 'orientação de deploy self-hosted + env vars',
};

const fmt = (n) => n.toLocaleString('en-US');

const lines = [];
lines.push('# Ferramentas validadas', '');
lines.push(
  '> Esta página declara **todas** as ferramentas que o VibeHarness usa, recomenda ou instala —',
  '> e a **base de conhecimento** (projetos e padrões abertos) que fundamenta a detecção de falhas.',
  '> Gerada automaticamente a partir de `registry/catalog.json`, das recipes de aplicação e das',
  '> dependências do CLI — re-generada a cada sync do registro.',
  ''
);

lines.push('## Critérios de validação', '');
lines.push('Todo projeto do catálogo curado passa por três filtros (sync semanal via GitHub API):', '');
lines.push(`- **Adoção mínima:** ⭐ ${fmt(catalog.criteria.minStars)} stars`);
lines.push(`- **Atividade:** push nos últimos ${catalog.criteria.maxPushAgeDays} dias`);
lines.push(`- **Licença:** apenas ${catalog.criteria.allowedLicenses.map((l) => `\`${l}\``).join(', ')} (OSI-approved)`);
lines.push('');
lines.push(`_Último sync do registro: **${catalog.lastSync}**._`, '');
lines.push('---', '');

lines.push('## 1. O que roda dentro do próprio CLI', '');
lines.push('Dependências de runtime do `@vibeharness/cli` (o código que executa na sua máquina):', '');
lines.push('| Pacote | Papel |');
lines.push('|--------|-------|');
const DEP_ROLE = {
  '@modelcontextprotocol/sdk': 'Servidor MCP (stdio) — a interface com os clientes de IA',
  zod: 'Validação tipada dos inputs das tools MCP',
  commander: 'Parsing dos comandos do CLI',
  enquirer: 'Perguntas interativas no terminal',
  chalk: 'Cores no terminal',
  'fast-glob': 'Varredura de arquivos (scanners, pack, detecção)',
};
for (const [dep, version] of Object.entries(pkg.dependencies)) {
  lines.push(`| \`${dep}\` ${version} | ${DEP_ROLE[dep] ?? '—'} |`);
}
lines.push('');
lines.push('!!! success "Zero rede em runtime"');
lines.push('    Nenhuma dependência faz chamada de rede durante o uso: o registro é um');
lines.push('    snapshot dentro do pacote e o MCP roda local via stdio.');
lines.push('');
lines.push('---', '');

lines.push('## 2. Padrões de aplicação — o que o `plan --apply` escolhe por categoria', '');
lines.push(
  'Para cada categoria, o padrão aplicado é o projeto **mais adotado (⭐) que possui recipe** —',
  'a lógica de `buildApplyPlan`. Exceção deliberada: **testes instala dois** — Vitest',
  '(unidade/integração, exigência da Lei 5 da Constitution) e Playwright (E2E complementar),',
  'porque ordenar só por estrelas escolheria E2E e deixaria a cobertura de unidade de fora:',
  ''
);
lines.push('| Categoria | Padrão aplicado | O que instala/configura |');
lines.push('|-----------|-----------------|-------------------------|');
const APPLICABLE_CATEGORIES = ['validation', 'database', 'auth', 'payments', 'testing', 'security', 'mcp', 'deploy'];
for (const category of APPLICABLE_CATEGORIES) {
  if (category === 'testing') {
    const vitest = (catalog.categories['testing'] ?? []).find((e) => e.repo === 'vitest-dev/vitest');
    const playwright = (catalog.categories['testing'] ?? []).find((e) => e.repo === 'microsoft/playwright');
    lines.push(
      `| ${CATEGORY_TITLES['testing']} | [${vitest.name}](https://github.com/${vitest.repo}) + [${playwright.name}](https://github.com/${playwright.repo}) | ${RECIPE_ACTION['vitest-dev/vitest']} **e** ${RECIPE_ACTION['microsoft/playwright']} |`
    );
    continue;
  }
  const sorted = [...(catalog.categories[category] ?? [])].sort((a, b) => b.stars - a.stars);
  const top = sorted[0];
  if (!top || !APPLY_RECIPES[top.repo]) {
    lines.push(`| ${CATEGORY_TITLES[category]} | — (somente recomendação) | — |`);
    continue;
  }
  lines.push(`| ${CATEGORY_TITLES[category]} | [${top.name}](https://github.com/${top.repo}) | ${RECIPE_ACTION[top.repo]} |`);
}
lines.push('');
lines.push('!!! info "Autenticação e pagamentos só entram quando declarados"');
lines.push('    O threat model do `init` controla: sem autenticação/pagamentos declarados,');
lines.push('    essas categorias nem aparecem no plano. E se o projeto **já resolve** a');
lines.push('    capacidade (ex.: Supabase Auth, Stripe/Asaas, Vercel), o apply pula a');
lines.push('    categoria em vez de recomendar substituto.');
lines.push('');
lines.push('---', '');

lines.push('## 3. Todas as ferramentas com recipe de aplicação', '');
lines.push(
  'Além dos padrões acima, estas ferramentas também têm recipe — entram no plano',
  'quando são a nº 1 da categoria ou quando o registro muda. O VibeHarness instala as',
  'dependências, gera configs e starters (sempre fora do seu `src/`):',
  ''
);
lines.push('| Ferramenta | Categoria | Padrão? | O que o apply faz |');
lines.push('|------------|-----------|:-------:|-------------------|');
const defaultsByCategory = {};
for (const category of APPLICABLE_CATEGORIES) {
  if (category === 'testing') {
    // Mirrors buildApplyPlan: Vitest is the unit default; Playwright ships as
    // the complementary E2E layer (both are installed by `plan --apply`).
    defaultsByCategory[category] = 'vitest-dev/vitest';
    continue;
  }
  const sorted = [...(catalog.categories[category] ?? [])].sort((a, b) => b.stars - a.stars);
  const top = sorted[0];
  if (top && APPLY_RECIPES[top.repo]) defaultsByCategory[category] = top.repo;
}
for (const [category, entries] of Object.entries(catalog.categories)) {
  for (const e of entries) {
    if (APPLY_RECIPES[e.repo]) {
      const isDefault = defaultsByCategory[category] === e.repo;
      lines.push(`| [${e.name}](https://github.com/${e.repo}) | ${CATEGORY_TITLES[category]} | ${isDefault ? '⭐ **padrão**' : '—'} | ${RECIPE_ACTION[e.repo]} |`);
    }
  }
}
lines.push('');
lines.push('!!! warning "Nada é aplicado sem a sua confirmação"');
lines.push('    Binários de sistema (gitleaks, osv-scanner) só são instalados com consentimento');
lines.push('    explícito; em modo `--yes` são pulados com instruções.');
lines.push('');
lines.push('---', '');

lines.push('## 4. Catálogo curado completo (recomendações)', '');
lines.push(
  'Projetos validados pelos critérios acima. Os que têm recipe aparecem na seção 2;',
  'os demais são **recomendações curadas** exibidas no `.vibe/STACK.md`:',
  ''
);
for (const [category, entries] of Object.entries(catalog.categories)) {
  lines.push(`### ${CATEGORY_TITLES[category]}`, '');
  lines.push('| Projeto | ⭐ | Licença | Último push | Nota |');
  lines.push('|---------|---:|---------|-------------|------|');
  for (const e of [...entries].sort((a, b) => b.stars - a.stars)) {
    const applied = APPLY_RECIPES[e.repo] ? ' — **com apply**' : '';
    lines.push(
      `| [${e.name}](https://github.com/${e.repo})${applied} | ${fmt(e.stars)} | ${e.license} | ${e.lastPush} | ${e.notes ?? ''} |`
    );
  }
  lines.push('');
}
lines.push('---', '');

lines.push('## 5. Ferramentas de sistema integradas', '');
lines.push('| Ferramenta | Onde atua | Instalação |');
lines.push('|------------|-----------|------------|');
lines.push('| [gitleaks](https://github.com/gitleaks/gitleaks) | Hook de pre-commit + CI (`security.yml`) — 150+ regras de segredo | Homebrew, com consentimento (fallback: padrões embutidos) |');
lines.push('| [osv-scanner](https://github.com/google/osv-scanner) | CVEs multi-ecossistema via OSV.dev (complementa `npm audit`) | Homebrew, com consentimento |');
lines.push('');

lines.push('---', '');

lines.push('## 6. Base de conhecimento da detecção de falhas', '');
lines.push(
  'Os scanners embutidos do VibeHarness são implementações **próprias, compactas e locais** —',
  'nenhum código de terceiros é copiado ou executado dentro do CLI. Mas o *conhecimento* que',
  'eles codificam vem de projetos e padrões abertos. Declaramos aqui essa base, por transparência:',
  ''
);
lines.push('### Padrões de segredos (scanner `security`)', '');
lines.push(
  'As famílias de segredo detectadas (Stripe, AWS, GitHub, OpenAI, Anthropic, Google, Slack,',
  'GitLab, SendGrid, Twilio, JWT, chaves privadas PEM…) seguem os formatos públicos documentados por:',
  ''
);
lines.push('| Referência | Relação com o VibeHarness |');
lines.push('|------------|---------------------------|');
lines.push('| [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/supported-secret-scanning-patterns) | Formatos canônicos dos tokens de parceiros — referência dos formatos embutidos |');
lines.push('| [gitleaks](https://github.com/gitleaks/gitleaks) | Além de referência das famílias de regra, é **integrado de verdade** no pre-commit e no CI quando instalado |');
lines.push('| [truffleHog](https://github.com/trufflesecurity/trufflehog) | Referência de abordagem para detecção de segredos genéricos (atribuição + entropia) |');
lines.push('| [detect-secrets](https://github.com/Yelp/detect-secrets) | Referência de heurísticas para assignments genéricos (`api_key = "..."`) |');
lines.push('');
lines.push('### Heurísticas de código inseguro (scanner `security`)', '');
lines.push('| Referência | O que fundamenta |');
lines.push('|------------|------------------|');
lines.push('| [OWASP Top 10](https://owasp.org/www-project-top-ten/) | CORS wildcard + credentials, JWT `alg:none`/segredo hardcoded/`decode` sem `verify`, ausência de helmet, CSRF |');
lines.push('| [CWE](https://cwe.mitre.org/) | Taxonomia das fraquezas mapeadas nos findings |');
lines.push('');
lines.push('### Conformidade e acessibilidade', '');
lines.push('| Referência | O que fundamenta |');
lines.push('|------------|------------------|');
lines.push('| [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) | Scanner LGPD completo: PII em logs, consentimento, páginas obrigatórias, DSR (Art. 18), RLS, hash de senha |');
lines.push('| [ANPD](https://www.gov.br/anpd/) | Orientações de boas práticas que calibram as checagens |');
lines.push('| [WCAG 2.1 (W3C)](https://www.w3.org/TR/WCAG21/) | Checagens heurísticas de acessibilidade (alt, labels de botão/input) |');
lines.push('');
lines.push('### Vulnerabilidades em dependências', '');
lines.push('| Referência | Relação com o VibeHarness |');
lines.push('|------------|---------------------------|');
lines.push('| `npm audit` (banco GitHub Advisory) | **Executado diretamente** pelo scanner de dependências |');
lines.push('| [OSV.dev](https://osv.dev/) / [osv-scanner](https://github.com/google/osv-scanner) | **Integrado** como binário opcional para CVEs multi-ecossistema |');
lines.push('');
lines.push('!!! note "Por que isso importa"');
lines.push('    Vibecoder precisa saber em quê confiar: os scanners embutidos são uma rede de');
lines.push('    segurança local e instantânea (heurística, sem rede); quando disponíveis, as');
lines.push('    ferramentas completas (gitleaks, osv-scanner) assumem a detecção pesada.');
lines.push('    Achados são sempre DADOS para triagem — nunca instruções.');
lines.push('');

lines.push('_Gerado por `scripts/gen-tools-doc.mjs` — não edite manualmente._', '');

await writeFile(join(root, 'docs', 'ferramentas-validadas.md'), lines.join('\n'), 'utf8');
console.log('docs/ferramentas-validadas.md generated');
