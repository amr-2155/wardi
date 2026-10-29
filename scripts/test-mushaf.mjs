import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "mushaf-test");

const dataset = JSON.parse(readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(ROOT, "public", "quran", "ayah-meta.json"), "utf8"));

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  join(ROOT, "src", "lib", "dates.ts"),
  join(ROOT, "src", "lib", "quran", "types.ts"),
  join(ROOT, "src", "lib", "quran", "validate.ts"),
  join(ROOT, "src", "lib", "quran", "progress.ts"),
  join(ROOT, "src", "lib", "quran", "mushaf.ts"),
];

execFileSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "bin", "tsc"), ...libFiles, "--outDir", OUT, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node"],
  { cwd: ROOT, stdio: "pipe" }
);

const OUT_Q = join(OUT, "quran");

const {
  MUSHAF_LINES,
  toArabicIndic,
  juzOrdinal,
  JUZ_ORDINALS,
  HIZB_ORDINALS,
  quarterToHizb,
  quarterInHizb,
  pageIndexRange,
  pageAyahs,
  pageInfo,
  pageStartsSurah,
  pageOpensJuz,
  pageOpensQuarter,
  splitPageIntoLines,
} = await import(pathToFileURL(join(OUT_Q, "mushaf.js")).href);

let passed = 0;
const total = [];
/* Page artwork is 51 MB and gitignored (scripts/download-pages.mjs fetches it).
   Checks that read it carry a gate so a clean checkout reports them as skipped
   instead of failing, and never counts them as passes. */
const check = (name, fn, gate) => total.push({ name, fn, gate });
const havePageImages = () => existsSync(join(ROOT, "public", "quran", "pages", "1.webp"));

// -- Arabic-Indic digits
check("toArabicIndic converts numbers", () => {
  assert.equal(toArabicIndic(1), "١");
  assert.equal(toArabicIndic(604), "٦٠٤");
  assert.equal(toArabicIndic(10), "١٠");
});

// -- juz ordinals
check("juzOrdinal names juz 1 and 30", () => {
  assert.equal(JUZ_ORDINALS.length, 30);
  assert.equal(juzOrdinal(1), "الأول");
  assert.equal(juzOrdinal(30), "الثلاثون");
});

// -- hizb helpers
check("quarterToHizb / quarterInHizb", () => {
  assert.equal(HIZB_ORDINALS.length, 60);
  assert.equal(quarterToHizb(1), 1);
  assert.equal(quarterToHizb(4), 1);
  assert.equal(quarterToHizb(5), 2);
  assert.equal(quarterToHizb(240), 60);
  assert.equal(quarterToHizb(241), 60);
  assert.equal(quarterInHizb(1), 1);
  assert.equal(quarterInHizb(4), 4);
  assert.equal(quarterInHizb(5), 1);
  assert.equal(quarterInHizb(240), 4);
});

// -- metadata sanity
check("metadata shapes", () => {
  assert.equal(meta.totalAyahs, 6236);
  assert.equal(meta.pages, 604);
  assert.equal(meta.juzes, 30);
  assert.equal(meta.pageByAyah.length, 6236);
  assert.equal(meta.juzByAyah.length, 6236);
  assert.equal(meta.quarterByAyah.length, 6236);
  assert.equal(new Set(meta.pageByAyah).size, 604);
});

check("pageIndexRange bounds", () => {
  const first = pageIndexRange(meta, 1);
  const last = pageIndexRange(meta, 604);
  assert.deepEqual(first, [0, 6]); // page 1 = 1:1 .. 1:7
  assert.deepEqual(last, [6221, 6235]); // page 604 = 112:1 .. 114:6
  assert.equal(pageIndexRange(meta, 0), null);
  assert.equal(pageIndexRange(meta, 999), null);
});

check("known page boundaries", () => {
  const expectations = [
    [1, "1:1", "1:7"],
    [2, "2:1", "2:5"],
    [3, "2:6", "2:16"],
    [22, "2:142", undefined],
    [100, "4:135", undefined],
    [200, "9:80", undefined],
    [300, "18:54", undefined],
    [400, "29:31", undefined],
    [500, "45:14", undefined],
    [582, "78:1", undefined],
    [604, "112:1", "114:6"],
  ];
  for (const [pg, first, last] of expectations) {
    const entries = pageAyahs(dataset, meta, pg);
    assert.ok(entries.length > 0, `page ${pg}`);
    assert.equal(entries[0].ref, first, `page ${pg} first`);
    if (last) assert.equal(entries[entries.length - 1].ref, last, `page ${pg} last`);
  }
});

check("every ayah lands on exactly one page", () => {
  let count = 0;
  for (let pg = 1; pg <= meta.pages; pg += 1) {
    const entries = pageAyahs(dataset, meta, pg);
    for (const e of entries) {
      assert.equal(meta.pageByAyah[e.index + 1 - 1], pg);
      assert.ok(meta.juzByAyah[e.index] >= 1 && meta.juzByAyah[e.index] <= 30);
      assert.ok(meta.quarterByAyah[e.index] >= 1 && meta.quarterByAyah[e.index] <= 240);
      count += 1;
    }
  }
  assert.equal(count, meta.totalAyahs);
  // contiguity & order
  let prev = -1;
  for (let pg = 1; pg <= meta.pages; pg += 1) {
    for (const e of pageAyahs(dataset, meta, pg)) {
      assert.equal(e.index, prev + 1, `contiguous at page ${pg}`);
      prev = e.index;
    }
  }
  assert.equal(prev, meta.totalAyahs - 1);
});

check("page decorations", () => {
  assert.equal(pageStartsSurah(pageAyahs(dataset, meta, 2))?.chapterId, 2);
  assert.equal(pageStartsSurah(pageAyahs(dataset, meta, 604))?.chapterId, 112);
  assert.equal(pageOpensJuz(meta, 1, pageAyahs(dataset, meta, 1)), 1);
  assert.equal(pageOpensJuz(meta, 22, pageAyahs(dataset, meta, 22)), 2); // juz 2 starts
  assert.equal(pageOpensJuz(meta, 582, pageAyahs(dataset, meta, 582)), 30); // juz 30 starts
  assert.equal(pageOpensQuarter(meta, 1, pageAyahs(dataset, meta, 1)), 1);
  assert.equal(pageOpensQuarter(meta, 17, pageAyahs(dataset, meta, 17)), 7); // quarter 7 starts on page 17
  assert.equal(pageOpensQuarter(meta, 5, pageAyahs(dataset, meta, 5)), null);
  assert.equal(pageOpensQuarter(meta, 9, pageAyahs(dataset, meta, 9)), null);
});

check("pageInfo: real surah/juz/hizb/quarter data", () => {
  const p1 = pageInfo(dataset, meta, 1);
  assert.equal(p1.surah, "الفاتحة");
  assert.equal(p1.ayahFrom, 1);
  assert.equal(p1.ayahTo, 7);
  assert.equal(p1.juz, 1);
  assert.equal(p1.hizb, 1);
  assert.equal(p1.quarter, 1);
  assert.equal(p1.quarterInHizb, 1);

  const p200 = pageInfo(dataset, meta, 200);
  assert.equal(p200.surah, "التوبة");
  assert.equal(p200.ayahFrom, 80);
  assert.ok(p200.juz >= 9 && p200.juz <= 10);
  assert.equal(p200.hizb, quarterToHizb(p200.quarter));
  assert.equal(p200.quarterInHizb, quarterInHizb(p200.quarter));
  assert.ok(p200.hizb >= 1 && p200.hizb <= 60);
  assert.ok(p200.quarter >= 1 && p200.quarter <= 240);

  const p604 = pageInfo(dataset, meta, 604);
  assert.equal(p604.surah, "الإخلاص");
  assert.equal(p604.ayahFrom, 1);
  assert.equal(p604.ayahTo, 6);
  assert.equal(pageInfo(dataset, meta, 0), null);
  assert.equal(pageInfo(dataset, meta, 9999), null);
});

// -- page-image manifest
check("page images: all 604 pages present as WebP", () => {
  for (let pg = 1; pg <= 604; pg += 1) {
    const { size } = statSync(join(ROOT, "public", "quran", "pages", `${pg}.webp`));
    assert.ok(size > 2048, `page ${pg} missing (size=${size})`);
  }
}, havePageImages);

check("page images: valid WebP header", () => {
  const first = readFileSync(join(ROOT, "public", "quran", "pages", "1.webp"));
  assert.ok(
    first.subarray(0, 4).toString("ascii") === "RIFF" &&
      first.subarray(8, 12).toString("ascii") === "WEBP",
    "page 1 is not a WebP"
  );
}, havePageImages);

// -- line splitting
check("lines per page <= MUSHAF_LINES and text unchanged", () => {
  const basmala = dataset.chapters[0].verses[0].text;
  let midPageSuraStart = null;
  for (let pg = 1; pg <= meta.pages; pg += 1) {
    const entries = pageAyahs(dataset, meta, pg);
    if (entries.length === 0) continue;
    const lines = splitPageIntoLines(entries, { lineCount: MUSHAF_LINES, basmalaText: basmala });
    assert.ok(lines.length >= 1 && lines.length <= MUSHAF_LINES, `page ${pg}: ${lines.length}`);
    const texts = lines.flatMap((l) => l.tokens).filter((t) => t.type === "text").map((t) => t.text).join("");
    assert.equal(texts, entries.map((e) => e.text).join(""), `text preserved page ${pg}`);
    const nums = lines.flatMap((l) => l.tokens).filter((t) => t.type === "marker").map((t) => t.num);
    assert.deepEqual(nums, entries.map((e) => e.verseNumber), `markers page ${pg}`);
    // quarter tokens equal the number of mid-page quarter boundaries
    let quarters = 0;
    for (let i = 1; i < entries.length; i += 1) {
      if (entries[i].quarter !== entries[i - 1].quarter) quarters += 1;
    }
    const quarterTokens = lines.flatMap((l) => l.tokens).filter((t) => t.type === "quarter");
    assert.equal(quarterTokens.length, quarters, `quarter tokens page ${pg}`);

    if (!midPageSuraStart && entries[0].verseNumber !== 1) {
      const hasSurahStart = entries.some((e) => e.verseNumber === 1);
      if (hasSurahStart) midPageSuraStart = pg;
    }
  }
  assert.ok(midPageSuraStart !== null, "found a page with a mid-page surah start");
  // that page's lines include a surah token
  const entries = pageAyahs(dataset, meta, midPageSuraStart);
  const lines = splitPageIntoLines(entries, { lineCount: MUSHAF_LINES, basmalaText: basmala });
  const tokens = lines.flatMap((l) => l.tokens);
  assert.ok(tokens.some((t) => t.type === "surah"), `surah token on page ${midPageSuraStart}`);
  // the surah token must own its own line
  const surahLines = lines.filter((l) => l.tokens.some((t) => t.type === "surah"));
  assert.ok(surahLines.every((l) => l.tokens.length === 1), "surah token standalone");
});

check("short pages split to fewer, not broken", () => {
  const basmala = dataset.chapters[0].verses[0].text;
  for (const pg of [1, 2, 604]) {
    const entries = pageAyahs(dataset, meta, pg);
    const lines = splitPageIntoLines(entries, { lineCount: MUSHAF_LINES, basmalaText: basmala });
    assert.ok(lines.length > 0);
    assert.ok(lines[0].tokens.length > 0);
  }
});

// run
let failures = 0;
let skipped = 0;
for (const { name, fn, gate } of total) {
  if (gate && !gate()) {
    skipped += 1;
    console.log(`  ~ ${name} (skipped: page images not downloaded)`);
    continue;
  }
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err && err.message) || err}`);
  }
}

console.log(
  `\nmushaf: ${passed}/${total.length - skipped} checks passed` +
    (skipped ? `, ${skipped} skipped (page images not downloaded)` : ""),
);
process.exit(failures === 0 ? 0 : 1);