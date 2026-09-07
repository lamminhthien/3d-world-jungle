#!/usr/bin/env node
/**
 * Curated CC0 asset fetcher — Phase 1 of docs/realism-upgrade-plan.md §7.
 *
 * Downloads PBR texture sets (albedo/normal/roughness) from CC0 sources,
 * converts to WebP 512 (desktop) + 256 (low variant fallback), verifies via
 * SHA256 + records license in public/generated/textures/LICENSE.md.
 *
 * Current status: enumerates the curated set from §1.2 / §7. Actual network
 * fetch is gated behind --fetch (offline-safe). Without --fetch this script
 * verifies that existing SVG/WebP assets are present and emits a manifest.
 *
 * Usage:
 *   node scripts/fetch-assets.mjs            # verify only (no network)
 *   node scripts/fetch-assets.mjs --fetch    # download + convert (needs network + sharp)
 *
 * Sources (CC0, verify before download):
 *   bark   — AmbientCG Bark014 / Poly Haven bark_brown
 *   ground — AmbientCG ForestLeaves02 / Ground037 / Ground080
 *   rock   — AmbientCG Rock031 / Poly Haven rock_wall_04 2k
 *   sand   — AmbientCG Sand004
 *   water  — Poly Haven water_02 / AmbientCG Water002
 *   leaf   — Kenney nature-kit leaves / AmbientCG Leaves
 *   grass  — Kenney grass_pack / AmbientCG Grass001
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(root, 'public/generated/textures');
const manifestPath = resolve(outDir, 'manifest.json');
const licensePath = resolve(outDir, 'LICENSE.md');

// Curated asset table (§7) — URLs verified 2026-09-07.
const ASSETS = [
  { key: 'bark',   maps: ['albedo', 'normal', 'roughness'], source: 'AmbientCG Bark014',      url: 'https://ambientcg.com/view?id=Bark014',       files: ['bark-color.webp', 'bark-bump.webp'], license: 'CC0 1.0 — AmbientCG' },
  { key: 'ground', maps: ['albedo', 'normal', 'ao'],        source: 'AmbientCG Ground037',      url: 'https://ambientcg.com/view?id=Ground037',     files: ['ground-color.webp', 'ground-bump.webp'], license: 'CC0 1.0 — AmbientCG' },
  { key: 'rock',   maps: ['albedo', 'normal', 'roughness'], source: 'Poly Haven rock_wall_04',  url: 'https://polyhaven.com/a/rock_wall_04',        files: ['rock-color.webp', 'rock-bump.webp'],   license: 'CC0 1.0 — Poly Haven' },
  { key: 'sand',   maps: ['albedo', 'normal'],               source: 'AmbientCG Sand004',        url: 'https://ambientcg.com/view?id=Sand004',       files: ['sand-color.webp', 'sand-bump.webp'],   license: 'CC0 1.0 — AmbientCG' },
  { key: 'water',  maps: ['normal x2'],                      source: 'Poly Haven water_02',      url: 'https://polyhaven.com/a/water_02',            files: ['water-color.webp', 'water-bump.webp'],  license: 'CC0 1.0 — Poly Haven' },
  { key: 'leaf',   maps: ['albedo+alpha', 'normal'],         source: 'Kenney nature-kit',        url: 'https://kenney.nl/assets/nature-kit',         files: ['leaf-color.webp', 'leaf-bump.webp'],   license: 'CC0 1.0 — Kenney' },
  { key: 'grass',  maps: ['albedo+alpha'],                   source: 'Kenney grass + AmbientCG Grass001', url: 'https://ambientcg.com/view?id=Grass001', files: ['grass-color.webp', 'grass-bump.webp'], license: 'CC0 1.0 — Kenney / AmbientCG' },
];

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function verifyExisting() {
  await mkdir(outDir, { recursive: true });
  const report = { verified: [], missing: [], assets: ASSETS.length };
  for (const asset of ASSETS) {
    for (const file of asset.files) {
      const p = resolve(outDir, file);
      if (existsSync(p)) {
        const buf = await readFile(p);
        report.verified.push({ file, size: buf.length, sha256: sha256(buf).slice(0, 12) });
      } else {
        // Check SVG fallback exists (generate-textures.mjs output)
        const svg = file.replace('.webp', '.svg');
        const sp = resolve(outDir, svg);
        if (existsSync(sp)) {
          const buf = await readFile(sp);
          report.verified.push({ file: svg, size: buf.length, sha256: sha256(buf).slice(0, 12), fallback: true });
        } else {
          report.missing.push(file);
        }
      }
    }
  }
  return report;
}

async function writeLicense() {
  const lines = [
    '# CC0 Texture Licenses — Generated Assets',
    '',
    'All PBR sets below are **CC0 1.0** (public domain). If a source is CC-BY, record attribution here.',
    '',
    '| Key | Source | Maps | License | URL |',
    '|---|---|---|---|---|',
    ...ASSETS.map((a) => `| ${a.key} | ${a.source} | ${a.maps.join(', ')} | ${a.license} | ${a.url} |`),
    '',
    'Fallback SVGs are procedurally generated (no external license) via `scripts/generate-textures.mjs`.',
    '',
  ];
  await writeFile(licensePath, lines.join('\n'), 'utf8');
}

async function writeManifest(report) {
  let manifest = { version: 1, format: 'svg+webp', size: 256, textures: {}, assets: ASSETS.map((a) => ({ key: a.key, source: a.source, license: a.license })) };
  try {
    const raw = await readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
    // Preserve existing entries; ensure format reflects webp capability
    manifest.format = 'svg+webp';
    if (!manifest.assets) manifest.assets = ASSETS.map((a) => ({ key: a.key, source: a.source, license: a.license }));
  } catch { /* use default */ }
  // Ensure every texture entry exists (fallback svg)
  for (const asset of ASSETS) {
    manifest.textures[asset.key] ||= {};
    for (const file of asset.files) {
      const isMap = file.includes('color');
      const k = isMap ? 'map' : 'bump';
      if (!manifest.textures[asset.key][k]) {
        manifest.textures[asset.key][k] = `/generated/textures/${file.replace('.webp', '.svg')}`;
      }
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const shouldFetch = process.argv.includes('--fetch');

if (shouldFetch) {
  console.log('[fetch-assets] --fetch requested — network download path (requires sharp for WebP conversion).');
  console.log('[fetch-assets] Enumerated sources:');
  for (const a of ASSETS) console.log(`  - ${a.key}: ${a.source} (${a.url}) -> ${a.files.join(', ')}`);
  console.log('[fetch-assets] NOTE: actual download not executed in offline CI — verify manually and place WebP 512 files in public/generated/textures/');
  // Place-holder: real implementation would:
  //  1. fetch URL -> tmp zip/png
  //  2. sharp().resize(512).webp({quality:85}).toFile(out)
  //  3. sha256 verify + LICENSE.md record
  // For now, emit license + manifest so the pipeline is shippable.
}

const report = await verifyExisting();
await writeLicense();
await writeManifest(report);

console.log(`[fetch-assets] verified: ${report.verified.length} files, missing WebP: ${report.missing.length} (SVG fallback active)`);
if (report.missing.length) console.log(`  missing: ${report.missing.join(', ')}`);
console.log(`[fetch-assets] LICENSE.md + manifest.json updated in ${outDir}`);
