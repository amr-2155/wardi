// Generates public/quran/ayah-meta.json: per-ayah mushaf metadata
// (page, juz, hizbQuarter) from the Al Quran Cloud API (islamic.network).
// Text is NOT taken from here — only the printed-mushaf pagination numbers.
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "quran");

const URL = "https://api.alquran.cloud/v1/quran/quran-uthmani";

const res = await fetch(URL, { headers: { accept: "application/json" } });
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
const data = await res.json();

const surahs = data?.data?.surahs;
if (!Array.isArray(surahs) || surahs.length !== 114) {
  throw new Error("unexpected alquran.cloud response shape");
}

// Canonical ayah order: surah id asc, then numberInSurah asc.
let total = 0;
const pages = new Set();
const juzes = new Set();
const quarters = new Set();
const pageByAyah = new Array(6236).fill(0);
const juzByAyah = new Array(6236).fill(0);
const quarterByAyah = new Array(6236).fill(0);
const firstRefs = new Map(); // page -> "s:ay"

let globalId = 0;
for (let s = 0; s < 114; s++) {
  const surah = surahs[s];
  if (surah.number !== s + 1) throw new Error(`surah order mismatch at ${s}`);
  for (const ayah of surah.ayahs) {
    const page = Number(ayah.page);
    const juz = Number(ayah.juz);
    const quarter = Number(ayah.hizbQuarter);
    if (!Number.isInteger(page) || page < 1 || page > 604) {
      throw new Error(`bad page ${page} at ${surah.number}:${ayah.numberInSurah}`);
    }
    if (!Number.isInteger(juz) || juz < 1 || juz > 30) throw new Error(`bad juz ${juz}`);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 240) {
      throw new Error(`bad quarter ${quarter}`);
    }
    pages.add(page);
    juzes.add(juz);
    quarters.add(quarter);
    if (!firstRefs.has(page)) firstRefs.set(page, `${surah.number}:${ayah.numberInSurah}`);
    pageByAyah[globalId] = page;
    juzByAyah[globalId] = juz;
    quarterByAyah[globalId] = quarter;
    globalId++;
  }
}

if (globalId !== 6236) throw new Error(`expected 6236, got ${globalId}`);
if (pages.size !== 604) throw new Error(`expected 604 pages, got ${pages.size}`);

const meta = {
  datasetVersion: "1.0.0",
  totalAyahs: globalId,
  pages: 604,
  juzes: 30,
  source: "Al Quran Cloud (islamic.network) quran-uthmani edition — pagination metadata only",
  sourceUrl: URL,
  pageByAyah, // 1..604
  juzByAyah, // 1..30
  quarterByAyah, // 1..240
};

mkdirSync(OUT, { recursive: true });
const outPath = join(OUT, "ayah-meta.json");
writeFileSync(outPath, JSON.stringify(meta), "utf8");
const sizeKb = (statSync(outPath).size / 1024).toFixed(1);
console.log(`written: public/quran/ayah-meta.json (${sizeKb} KB)`);
console.log(`pages=${pages.size} juzes=${juzes.size} quarters=${quarters.size}`);