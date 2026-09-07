#!/usr/bin/env node
/**
 * Fetch CC0 / CC-BY jungle music for sampled playback.
 * Offline-safe: verifies existing files, downloads with --fetch.
 *
 * Usage:
 *   node scripts/fetch-music.mjs           # verify only
 *   node scripts/fetch-music.mjs --fetch   # download + manifest
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { get } from 'node:https';

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(root, 'public/generated/music');
const manifestPath = resolve(outDir, 'manifest.json');
const licensePath = resolve(outDir, 'LICENSE.md');

const TRACKS = [
  {
    id: 'joyful-jungle',
    file: 'joyful_jungle_bpm140.mp3',
    url: 'https://opengameart.org/sites/default/files/joyful_jungle_bpm140.mp3',
    license: 'CC0 1.0 — MintoDog',
  },
  {
    id: 'joyful-jungle-ogg',
    file: 'joyful_jungle_bpm140.ogg',
    url: 'https://opengameart.org/sites/default/files/joyful_jungle_bpm140_0.ogg',
    license: 'CC0 1.0 — MintoDog',
  },
  {
    id: 'monkeys-spinning',
    file: 'monkeys_spinning_monkeys.ogg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/37/Kevin_MacLeod_-_Monkeys_Spinning_Monkeys.ogg',
    license: 'CC BY 3.0 — Kevin MacLeod',
  },
  {
    id: 'bamboo-blitz',
    file: 'bamboo_blitz.ogg',
    url: 'https://opengameart.org/sites/default/files/bamboo_blitz.ogg',
    license: 'CC0 1.0 — Tsorthan Grove',
  },
];

function sha12(buf) { return createHash('sha256').update(buf).digest('hex').slice(0,12); }

async function verify() {
  await mkdir(outDir, {recursive:true});
  const report = { verified: [], missing: [] };
  for (const t of TRACKS) {
    const p = resolve(outDir, t.file);
    if (existsSync(p)) {
      const buf = await readFile(p);
      report.verified.push({ file: t.file, size: buf.length, sha: sha12(buf) });
    } else {
      report.missing.push(t.file);
    }
  }
  return report;
}

function download(url, dest) {
  return new Promise((resolve_, reject) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      res.pipe(file);
      file.on('finish', () => file.close(resolve_));
    }).on('error', reject);
  });
}

const shouldFetch = process.argv.includes('--fetch');
const report = await verify();
console.log(`[fetch-music] verified: ${report.verified.length} files, missing: ${report.missing.length}`);
if (report.verified.length) console.log(`  verified: ${report.verified.map(v=>`${v.file} (${v.size}B ${v.sha})`).join(', ')}`);
if (report.missing.length) console.log(`  missing: ${report.missing.join(', ')}`);

if (shouldFetch && report.missing.length) {
  console.log('[fetch-music] downloading missing tracks...');
  for (const t of TRACKS) {
    const p = resolve(outDir, t.file);
    if (existsSync(p)) continue;
    console.log(`  -> ${t.file} from ${t.url}`);
    try { await download(t.url, p); console.log(`     saved ${t.file}`); } catch (e) { console.error(`     failed: ${e.message}`); }
  }
  const r2 = await verify();
  console.log(`[fetch-music] after fetch: verified ${r2.verified.length}, missing ${r2.missing.length}`);
}

console.log(`[fetch-music] manifest: ${manifestPath}`);
console.log(`[fetch-music] licenses: ${licensePath}`);
