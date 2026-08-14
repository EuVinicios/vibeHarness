#!/usr/bin/env node
/**
 * registry-sync — refresh registry/catalog.json from the GitHub API.
 *
 * Fetches stars, license and last-push date for every entry. The catalog file
 * is rewritten ONLY when at least one material value (stars / license /
 * lastPush) actually changed, so the weekly CI job opens a PR only when there
 * is something to review. On a write, every entry's lastVerified and the
 * top-level lastSync are stamped with today's date.
 *
 * Usage:
 *   node scripts/registry-sync.mjs [--dry-run]
 *
 * Env:
 *   GITHUB_TOKEN / GH_TOKEN — strongly recommended (5k req/h vs 60 unauth).
 */

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(here, '..', 'registry', 'catalog.json');

const dryRun = process.argv.includes('--dry-run');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'vibe-harness-registry-sync',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (token) headers.Authorization = `Bearer ${token}`;
else console.warn('⚠  No GITHUB_TOKEN/GH_TOKEN set — unauthenticated rate limit is 60 req/h.');

const today = new Date().toISOString().split('T')[0];
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

const changes = [];
let errors = 0;
let dirty = false;

async function fetchRepo(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

for (const [category, entries] of Object.entries(catalog.categories)) {
  for (const entry of entries) {
    try {
      const data = await fetchRepo(entry.repo);
      const stars = data.stargazers_count;
      const license = data.license?.spdx_id ?? 'none';
      const lastPush = (data.pushed_at ?? '').split('T')[0];

      if (typeof stars === 'number' && entry.stars !== stars) {
        changes.push(`${category}/${entry.repo}: stars ${entry.stars} → ${stars}`);
        entry.stars = stars;
        dirty = true;
      }
      // licenseOverride = maintainer-verified license for repos where the GitHub
      // API reports NOASSERTION (e.g. monorepos with vendored license files).
      // The override wins and API updates are ignored for that field.
      if (entry.licenseOverride) {
        if (entry.license !== entry.licenseOverride) {
          entry.license = entry.licenseOverride;
          dirty = true;
        }
      } else if (entry.license !== license) {
        changes.push(`${category}/${entry.repo}: license ${entry.license} → ${license}`);
        entry.license = license;
        dirty = true;
      }
      if (lastPush && entry.lastPush !== lastPush) {
        entry.lastPush = lastPush;
        dirty = true;
      }
    } catch (err) {
      errors++;
      console.warn(`  ! ${category}/${entry.repo}: ${err.message} — skipped`);
    }
    // Be polite: stay well under secondary rate limits.
    await new Promise((r) => setTimeout(r, 250));
  }
}

if (!dirty) {
  console.log(`No material changes (${errors} error(s)). Catalog left untouched — no PR needed.`);
  process.exit(0);
}

// Validate entries against the catalog's own curation criteria. Violations do
// not block the write, but they are surfaced as CI warnings + step summary so
// the human reviewing the auto-PR sees them (fail-loud, not fail-open).
const violations = [];
const todayMs = Date.parse(today);
  for (const [category, entries] of Object.entries(catalog.categories)) {
    for (const entry of entries) {
      const effectiveLicense = entry.licenseOverride ?? entry.license;
      // Licenses outside the allowlist are tolerated ONLY with a licenseNote
      // documenting the exception (AGPL/LGPL CLI-only tools, proprietary CLIs).
      const licenseOk =
        catalog.criteria.allowedLicenses.includes(effectiveLicense) ||
        (typeof entry.licenseNote === 'string' && entry.licenseNote.trim().length > 0);
      if (!licenseOk) {
        violations.push(`${category}/${entry.repo}: license "${effectiveLicense}" not allowed and no licenseNote documenting an exception`);
      }
      if (typeof entry.stars === 'number' && entry.stars < catalog.criteria.minStars) {
        violations.push(`${category}/${entry.repo}: ${entry.stars} stars is below minStars (${catalog.criteria.minStars})`);
      }
    const pushAgeDays = (todayMs - Date.parse(entry.lastPush)) / 86400000;
    if (Number.isNaN(pushAgeDays) || pushAgeDays > catalog.criteria.maxPushAgeDays) {
      violations.push(`${category}/${entry.repo}: last push ${entry.lastPush} exceeds maxPushAgeDays (${catalog.criteria.maxPushAgeDays})`);
    }
  }
}

for (const v of violations) console.log(`::warning::registry criteria violation — ${v}`);
if (violations.length > 0 && process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `\n## ⚠️ Registry criteria violations (${violations.length})\n\nReview these entries before merging — they no longer meet the catalog curation criteria:\n\n${violations.map((v) => `- ${v}`).join('\n')}\n`,
    'utf8'
  );
}

// Stamp verification dates only when we actually write.
for (const entries of Object.values(catalog.categories)) {
  for (const entry of entries) entry.lastVerified = today;
}
catalog.lastSync = today;

if (dryRun) {
  console.log(`[dry-run] ${changes.length} material change(s), ${errors} error(s). Not writing.`);
} else {
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  console.log(`Wrote registry/catalog.json — ${changes.length} material change(s), ${errors} error(s).`);
}

for (const c of changes) console.log('  - ' + c);
if (errors > 0) console.warn(`\n${errors} repo(s) could not be refreshed (kept previous values).`);
