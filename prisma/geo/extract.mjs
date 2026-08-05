/**
 * Ekstrak data GeoJSON dari webmap referensi "PEMBAGIAN WS BB"
 * (folder D:\SIPENGSUI\WS BB\PEMBAGIAN WS BB\data).
 *
 * File sumber berupa `var json_<nama> = { ... };` → dibaca, di-parse,
 * dan ditulis sebagai GeoJSON murni ke prisma/geo/*.json untuk dipakai seed.
 *
 * Pemakaian:
 *   node prisma/geo/extract.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = 'D:/SIPENGSUI/WS BB/PEMBAGIAN WS BB/data';
const OUT_DIR = __dirname;

const FILES = [
  { src: 'WilayahSungai_4.js', out: 'wilayah-sungai.json' },
  { src: 'PembagianWilayahSungaiBerdasarkanDEM_2.js', out: 'pembagian-ws-dem.json' },
  { src: 'DaerahAliranSungai_3.js', out: 'daerah-aliran-sungai.json' },
  { src: 'Sungai_5.js', out: 'sungai.json' },
];

if (!fs.existsSync(SRC_DIR)) {
  console.error(`Folder referensi tidak ditemukan: ${SRC_DIR}`);
  process.exit(1);
}

for (const { src, out } of FILES) {
  const raw = fs.readFileSync(path.join(SRC_DIR, src), 'utf8');
  // Format: `var json_Nama = {...};` (bisa ada trailing `;`/spasi)
  const match = raw.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) {
    console.error(`Tidak bisa parse: ${src}`);
    process.exit(1);
  }
  const json = JSON.parse(match[1]);
  const outPath = path.join(OUT_DIR, out);
  fs.writeFileSync(outPath, JSON.stringify(json));
  console.log(`✅ ${src} → ${out} (${json.features.length} fitur)`);
}

console.log('\nSelesai.');
