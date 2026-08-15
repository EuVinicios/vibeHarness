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
  'modelcontextprotocol/servers': 'escreve `.mcp.json` com servidores MCP curados',
  'coollabsio/coolify': 'orientação de deploy self-hosted + env vars',
};

const fmt = (n) => n.toLocaleString('en-US');

const lines = [];
lines.push('# Ferramentas validadas', '');
lines.push(
  '> Esta página declara **todas** as ferramentas que o VibeHarness usa, recomenda ou instala.',
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

lines.push('## 2. O que o `plan --apply` instala e configura de verdade', '');
lines.push(
  'Estas são as ferramentas com **recipe de aplicação** — o VibeHarness instala as',
  'dependências, gera configs e starters (sempre fora do seu `src/`):',
  ''
);
lines.push('| Ferramenta | Categoria | O que o apply faz |');
lines.push('|------------|-----------|-------------------|');
for (const [category, entries] of Object.entries(catalog.categories)) {
  for (const e of entries) {
    if (APPLY_RECIPES[e.repo]) {
      lines.push(`| [${e.name}](https://github.com/${e.repo}) | ${CATEGORY_TITLES[category]} | ${RECIPE_ACTION[e.repo]} |`);
    }
  }
}
lines.push('');
lines.push('!!! warning "Nada é aplicado sem a sua confirmação"');
lines.push('    Binários de sistema (gitleaks, osv-scanner) só são instalados com consentimento');
lines.push('    explícito; em modo `--yes` são pulados com instruções.');
lines.push('');
lines.push('---', '');

lines.push('## 3. Catálogo curado completo (recomendações)', '');
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

lines.push('## 4. Ferramentas de sistema integradas', '');
lines.push('| Ferramenta | Onde atua | Instalação |');
lines.push('|------------|-----------|------------|');
lines.push('| [gitleaks](https://github.com/gitleaks/gitleaks) | Hook de pre-commit + CI (`security.yml`) — 150+ regras de segredo | Homebrew, com consentimento (fallback: padrões embutidos) |');
lines.push('| [osv-scanner](https://github.com/google/osv-scanner) | CVEs multi-ecossistema via OSV.dev (complementa `npm audit`) | Homebrew, com consentimento |');
lines.push('');

lines.push('_Gerado por `scripts/gen-tools-doc.mjs` — não edite manualmente._', '');

await writeFile(join(root, 'docs', 'ferramentas-validadas.md'), lines.join('\n'), 'utf8');
console.log('docs/ferramentas-validadas.md generated');
