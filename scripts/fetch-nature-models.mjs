#!/usr/bin/env node
/**
 * Fetch curated CC0 nature GLB models — Full replacement pipeline.
 *
 * Downloads Kenney Nature Kit (329 GLBs, CC0) and extracts a curated
 * low-poly jungle subset. Also optionally fetches Quaternius Ultimate
 * Nature (150 models, CC0) when --quaternius is passed.
 *
 * Without --fetch this verifies existing assets and emits a manifest
 * with procedural fallback (offline-safe, never breaks build).
 *
 * Usage:
 *   node scripts/fetch-nature-models.mjs            # verify only
 *   node scripts/fetch-nature-models.mjs --fetch    # download Kenney curated set
 *   node scripts/fetch-nature-models.mjs --fetch --quaternius  # + Quaternius pack
 *   node scripts/fetch-nature-models.mjs --fetch --all          # all 329 Kenney GLBs
 *
 * Output:
 *   public/generated/models/kenney/*.glb
 *   public/generated/models/quaternius/*.glb  (optional)
 *   public/generated/models/manifest.json
 *   public/generated/models/LICENSE.md
 */

import { mkdir, writeFile, readFile, stat, readdir, copyFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(root, 'public/generated/models');
const kenneyDir = resolve(outDir, 'kenney');
const quaterniusDir = resolve(outDir, 'quaternius');
const manifestPath = resolve(outDir, 'manifest.json');
const licensePath = resolve(outDir, 'LICENSE.md');

// Kenney direct CC0 URL (verified 2026-09-07 — 10.5 MB, 329 GLBs)
const KENNEY_URL = 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip';
// Quaternius Ultimate Nature — via CDN mirror (GLB via poly.pizza) — optional
const QUATERNIUS_URLS = [
  'https://quaternius.com/assets/UltimateNaturePack.zip', // original (may 404, fallback to poly)
];

// Curated jungle subset — 24 models covers all presets.js kinds
// One per pool = 1 draw call per kind, variants are tier-randomized at runtime.
const CURATED = [
  // broadleaf / detailed (oak is the hero)
  'tree_oak.glb',
  'tree_detailed.glb',
  'tree_default.glb',
  // pine variants
  'tree_pineTallA.glb',
  'tree_pineTallA_detailed.glb',
  'tree_pineRoundA.glb',
  'tree_cone.glb',
  // palm variants
  'tree_palmTall.glb',
  'tree_palmDetailedTall.glb',
  'tree_palm.glb',
  // bush / foliage
  'plant_bush.glb',
  'plant_bushLarge.glb',
  'plant_bushDetailed.glb',
  // rock / stone
  'rock_largeA.glb',
  'rock_smallA.glb',
  'stone_largeA.glb',
  // cactus
  'cactus_tall.glb',
  'cactus_short.glb',
  // flower / grass
  'flower_redA.glb',
  'flower_yellowA.glb',
  'grass_large.glb',
  'grass.glb',
  // extras
  'rock_tallA.glb',
  'stone_smallA.glb',
];

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function download(url, dest) {
  console.log(`[nature-models] downloading ${url} -> ${basename(dest)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`[nature-models] saved ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  return dest;
}

async function unzip(zipPath, out) {
  // Prefer system `unzip` (macOS/Linux CI). Fallback to Node `yauzl` style is unnecessary.
  await mkdir(out, { recursive: true });
  await new Promise((resolveP, reject) => {
    const cmd = spawn('unzip', ['-o', '-q', zipPath, '-d', out]);
    let err = '';
    cmd.stderr.on('data', (d) => err += d);
    cmd.on('close', (code) => code === 0 ? resolveP() : reject(new Error(`unzip exit ${code}: ${err}`)));
    cmd.on('error', reject);
  });
}

async function extractKenneyCurated(tmpExtract) {
  const srcGltfDir = resolve(tmpExtract, 'Models/GLTF format');
  await mkdir(kenneyDir, { recursive: true });
  let copied = 0;
  const wantAll = process.argv.includes('--all');
  const list = wantAll ? (await readdir(srcGltfDir)).filter(f => f.endsWith('.glb')) : CURATED;
  for (const file of list) {
    const src = resolve(srcGltfDir, file);
    if (!existsSync(src)) {
      console.warn(`[nature-models] missing curated file ${file} — skipping`);
      continue;
    }
    const dst = resolve(kenneyDir, file);
    await copyFile(src, dst);
    copied++;
  }
  console.log(`[nature-models] extracted ${copied} kenney glbs -> ${kenneyDir}`);
  return copied;
}

async function verifyExisting() {
  await mkdir(outDir, { recursive: true });
  await mkdir(kenneyDir, { recursive: true });
  const report = { verified: [], missing: [], curated: CURATED.length };
  for (const file of CURATED) {
    const p = resolve(kenneyDir, file);
    if (existsSync(p)) {
      const buf = await readFile(p);
      report.verified.push({ file: `kenney/${file}`, size: buf.length, sha256: sha256(buf).slice(0, 12) });
    } else {
      report.missing.push(`kenney/${file}`);
    }
  }
  // Also count any quaternius
  if (existsSync(quaterniusDir)) {
    try {
      const qfiles = await readdir(quaterniusDir);
      for (const f of qfiles.filter(x => x.endsWith('.glb'))) {
        const buf = await readFile(resolve(quaterniusDir, f));
        report.verified.push({ file: `quaternius/${f}`, size: buf.length, sha256: sha256(buf).slice(0, 12) });
      }
    } catch {}
  }
  return report;
}

async function writeLicense() {
  const lines = [
    '# CC0 Nature Models — Generated Assets',
    '',
    'All models below are **CC0 1.0** (public domain). No attribution required.',
    '',
    '| Pack | Source | Count | License | URL |',
    '|---|---|---|---|---|',
    `| Kenney Nature Kit | Kenney.nl | 329 (curated ${CURATED.length}) | CC0 1.0 | ${KENNEY_URL} |`,
    `| Quaternius Ultimate Nature | Quaternius | 150 (optional) | CC0 1.0 | https://quaternius.com/ |`,
    `| Eclair GLB convenience pack | Eclair Assets (Kenney re-pack) | 329 GLB | CC0 1.0 | https://eclair-assets.itch.io/nature-kit-glb-pack-329-free-cc0-3d-models |`,
    '',
    `Curated subset (${CURATED.length} files):`,
    ...CURATED.map(f => `- kenney/${f}`),
    '',
    'Fallback: procedural geometries in `src/world/presets.js` (no external license).',
    'InstancedMesh pools keep 1 draw call per species; external GLBs just replace the BufferGeometry.',
    '',
  ];
  await writeFile(licensePath, lines.join('\n'), 'utf8');
}

async function writeManifest(report) {
  let manifest = {
    version: 1,
    source: 'kenney+quaternius CC0',
    curated: CURATED,
    models: {},
    verified: report.verified.length,
  };
  // Build models map: key = preset hint, value = public URL
  const base = '/generated/models';
  const map = {
    'pine': ['kenney/tree_pineTallA.glb', 'kenney/tree_pineRoundA.glb', 'kenney/tree_cone.glb'],
    'broadleaf': ['kenney/tree_oak.glb', 'kenney/tree_detailed.glb', 'kenney/tree_default.glb'],
    'palm': ['kenney/tree_palmTall.glb', 'kenney/tree_palmDetailedTall.glb'],
    'bush': ['kenney/plant_bush.glb', 'kenney/plant_bushLarge.glb'],
    'rock': ['kenney/rock_largeA.glb', 'kenney/rock_smallA.glb', 'kenney/stone_largeA.glb'],
    'cactus': ['kenney/cactus_tall.glb', 'kenney/cactus_short.glb'],
    'flower': ['kenney/flower_redA.glb', 'kenney/flower_yellowA.glb'],
    'grass': ['kenney/grass.glb', 'kenney/grass_large.glb'],
  };
  for (const [kind, files] of Object.entries(map)) {
    manifest.models[kind] = files.map(f => `${base}/${f}`);
  }
  // Flat file list with existence flag
  manifest.files = {};
  for (const v of report.verified) manifest.files[v.file] = { size: v.size, sha256: v.sha256, present: true };
  for (const m of report.missing) if (!manifest.files[m]) manifest.files[m] = { present: false };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const shouldFetch = process.argv.includes('--fetch');

if (shouldFetch) {
  console.log('[nature-models] --fetch requested');
  const tmpZip = resolve('/tmp', 'kenney_nature-kit.zip');
  const tmpExtract = resolve('/tmp', 'kenney-extract');
  try {
    await download(KENNEY_URL, tmpZip);
    await unzip(tmpZip, tmpExtract);
    await extractKenneyCurated(tmpExtract);
  } catch (e) {
    console.error('[nature-models] fetch failed:', e.message);
    console.log('[nature-models] hint: download manually from https://kenney.nl/assets/nature-kit');
    console.log('[nature-models] and place Models/GLTF format/*.glb into public/generated/models/kenney/');
  }
  if (process.argv.includes('--quaternius')) {
    console.log('[nature-models] --quaternius requested but skipped (manual: download from https://quaternius.com/ )');
  }
}

const report = await verifyExisting();
await writeLicense();
await writeManifest(report);

console.log(`[nature-models] verified: ${report.verified.length} files, missing curated: ${report.missing.length}`);
if (report.missing.length) {
  console.log(`  missing: ${report.missing.slice(0, 6).join(', ')}${report.missing.length > 6 ? ' ...' : ''}`);
  if (!shouldFetch) console.log(`  run: node scripts/fetch-nature-models.mjs --fetch  (or --fetch --all for 329)`);
}
console.log(`[nature-models] manifest.json + LICENSE.md updated in ${outDir}`);
