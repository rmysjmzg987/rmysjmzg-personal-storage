// 生成 public/data/catalog.json（预制 18 颗 + 内置卫星库）
//
// 用法：
//   npm run fetch:tle              # 默认：优先用本地缓存目录（_probe、tle-cache），缺失项联网补齐
//   npm run fetch:tle -- --net     # 全部走 CelesTrak 网络抓取
//   npm run fetch:tle -- --from dir1 --from dir2
//
// 数据来源：CelesTrak GP 数据（公开 TLE）https://celestrak.org/NORAD/elements/gp.php
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESET, LIBRARY, GROUPS } from './catalog-manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const argv = process.argv.slice(2);
const useNet = argv.includes('--net');
const forceNet = argv.includes('--force-net');
const cacheDirs = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--from' && argv[i + 1]) cacheDirs.push(resolve(root, argv[i + 1]));
}
if (cacheDirs.length === 0) {
  for (const candidate of ['_probe', 'tle-cache']) {
    const dir = join(root, candidate);
    if (existsSync(dir)) cacheDirs.push(dir);
  }
}

const wanted = [...PRESET, ...LIBRARY].map((entry) => ({ ...entry, norad: entry.norad }));
const wantedIds = new Set(wanted.map((e) => e.norad));

function parseTleBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('1 ')) continue;
    const line1 = lines[i];
    const line2 = lines[i + 1];
    if (!line2 || !line2.startsWith('2 ')) continue;
    const name = (lines[i - 1] ?? '').replace(/^0 /, '').trim();
    out.push({ name, line1, line2 });
  }
  return out;
}

function noradOf(line1) {
  return parseInt(line1.slice(2, 7), 10);
}

function epochFromTle(line1) {
  const field = line1.slice(18, 32).trim();
  const year = parseInt(field.slice(0, 2), 10);
  const day = parseFloat(field.slice(2));
  const fullYear = year < 57 ? 2000 + year : 1900 + year;
  const ms = Date.UTC(fullYear, 0, 1) + (day - 1) * 86400000;
  return new Date(ms);
}

// 1) 本地缓存
const found = new Map();
const sources = [];
for (const dir of cacheDirs) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.tle')) continue;
    const blocks = parseTleBlocks(readFileSync(join(dir, file), 'utf8'));
    let hit = 0;
    for (const block of blocks) {
      const id = noradOf(block.line1);
      if (!wantedIds.has(id) || found.has(id)) continue;
      found.set(id, block);
      hit += 1;
    }
    if (hit > 0) sources.push(`${dir.split(/[\\/]/).pop()}/${file}(${hit})`);
  }
  if (found.size === wantedIds.size) break;
}

// 2) 联网络补齐
async function fetchOne(norad) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=tle`;
  const res = await fetch(url, { headers: { 'user-agent': 'satellite-orbit-viewer/0.1 (+offline-demo)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const blocks = parseTleBlocks(text);
  if (blocks.length === 0) throw new Error('empty response');
  return blocks[0];
}

const missingBeforeNet = wanted.filter((e) => !found.has(e.norad));
if (missingBeforeNet.length > 0 && (useNet || cacheDirs.length === 0 || forceNet)) {
  console.log(`联网抓取 ${missingBeforeNet.length} 颗缺失卫星…`);
  for (const entry of missingBeforeNet) {
    try {
      const block = await fetchOne(entry.norad);
      found.set(entry.norad, block);
      sources.push(`celestrak:${entry.norad}`);
    } catch (error) {
      console.warn(`  ! ${entry.norad} 抓取失败：${error.message}`);
    }
  }
}

const missing = wanted.filter((e) => !found.has(e.norad));

// 3) 组装目录
function buildEntry(entry, group) {
  const block = found.get(entry.norad);
  const tleName = block.name || entry.label || String(entry.norad);
  return {
    noradId: entry.norad,
    name: tleName,
    label: entry.label ?? undefined,
    labelZh: entry.labelZh ?? undefined,
    group,
    fovDeg: entry.fovDeg,
    tle1: block.line1,
    tle2: block.line2,
    descZh: entry.descZh,
    descEn: entry.descEn,
  };
}

const preset = PRESET.filter((e) => found.has(e.norad)).map((e) => ({ ...buildEntry(e, e.group), preset: true }));
const library = LIBRARY.filter((e) => found.has(e.norad)).map((e) => buildEntry(e, e.group));

const epochMax = [...found.values()].reduce((acc, block) => {
  const epoch = epochFromTle(block.line1);
  return epoch > acc ? epoch : acc;
}, new Date(0));
const snapshotDate = epochMax.toISOString().slice(0, 10);

const catalog = {
  snapshotDate,
  source: 'CelesTrak GP (public TLE) — https://celestrak.org',
  generatedAt: new Date().toISOString(),
  groups: GROUPS,
  satellites: [...preset, ...library].map((entry) =>
    Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)),
  ),
};

const outDir = join(root, 'public', 'data');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'catalog.json');
writeFileSync(outFile, serialize(catalog), 'utf8');

function serialize(data) {
  const rows = data.satellites.map((sat) => `    ${JSON.stringify(sat)}`);
  return [
    '{',
    `  "snapshotDate": ${JSON.stringify(data.snapshotDate)},`,
    `  "source": ${JSON.stringify(data.source)},`,
    `  "generatedAt": ${JSON.stringify(data.generatedAt)},`,
    `  "groups": ${JSON.stringify(data.groups)},`,
    '  "satellites": [',
    rows.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

console.log(`\n写入 ${outFile}`);
console.log(`  预制 ${preset.length} 颗 / 卫星库 ${library.length} 颗 / 快照 ${snapshotDate}`);
console.log(`  本地来源：${sources.length ? sources.join(', ') : '无'}`);
if (missing.length > 0) {
  console.warn(`  缺失 ${missing.length} 颗：${missing.map((e) => e.norad).join(', ')}`);
  process.exitCode = 1;
}
