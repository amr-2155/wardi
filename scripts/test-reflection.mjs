/**
 * P2 — Reflection grounded in the pages actually read.
 *
 * Proves the reflection ayah comes from the authentic ayah-meta pagination of
 * the printed pages the reader confirmed, never from a hash of the date over
 * an unrelated pool. Uses the REAL dataset + meta shipped with the app.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "reflection-test");

const dataset = JSON.parse(readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8"));
const metaRaw = JSON.parse(readFileSync(join(ROOT, "public", "quran", "ayah-meta.json"), "utf8"));
const meta = metaRaw.meta ?? metaRaw;
const tafsir = JSON.parse(readFileSync(join(ROOT, "src", "data", "quran", "tafsir.json"), "utf8"));
const pool = tafsir.entries.map((e) => e.ref);

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  join(ROOT, "src", "lib", "dates.ts"),
  join(ROOT, "src", "lib", "types.ts"),
  join(ROOT, "src", "lib", "quran", "types.ts"),
  join(ROOT, "src", "lib", "quran", "validate.ts"),
  join(ROOT, "src", "lib", "quran", "progress.ts"),
  join(ROOT, "src", "lib", "quran", "mushaf.ts"),
  join(ROOT, "src", "lib", "quran", "reflection.ts"),
];
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    ...libFiles,
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "es2019",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types",
    "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const { pickReflectionFromPages } = await import(pathToFileURL(join(OUT, "quran", "reflection.js")).href);
const { pageAyahs } = await import(pathToFileURL(join(OUT, "quran", "mushaf.js")).href);
const { resolveAyah } = await import(pathToFileURL(join(OUT, "quran", "validate.js")).href);

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/** Every authentic ref printed on a set of pages. */
const refsOn = (pages) =>
  [...new Set(pages.flatMap((p) => pageAyahs(dataset, meta, p).map((a) => a.ref)))];

/** Balanced body of every `if (...) {` block matching the opener. */
function braceBlocks(src, opener) {
  const out = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf(opener, from);
    if (start < 0) break;
    let depth = 0;
    let end = -1;
    for (let i = start + opener.length - 1; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) break;
    out.push(src.slice(start, end + 1));
    from = end + 1;
  }
  return out;
}

/* ---- 1. Selection is confined to the pages actually read ---- */
check("R1: reflection ayah is always one of the ayahs printed on the read pages", () => {
  for (const pages of [
    [1],
    [1, 2, 3],
    Array.from({ length: 25 }, (_, i) => i + 1),
    [200, 201, 202],
    [600, 601, 602, 603, 604],
  ]) {
    const ref = pickReflectionFromPages({ dataset, meta, pool, pages });
    assert.ok(ref, `a ref is chosen for pages ${pages[0]}..${pages.at(-1)}`);
    assert.ok(refsOn(pages).includes(ref), `${ref} is genuinely printed on the read pages`);
    assert.ok(resolveAyah(ref, dataset), `${ref} resolves in the canonical dataset`);
  }
});

check("R2: a ward read on later pages never yields an early-page ayah", () => {
  const pages = [300, 301, 302];
  const early = new Set(refsOn([1, 2, 3, 4, 5]));
  const ref = pickReflectionFromPages({ dataset, meta, pool, pages });
  assert.ok(ref);
  assert.ok(!early.has(ref), `${ref} is not from the unread opening pages`);
});

check("R3: no pages read means no invented reflection", () => {
  assert.equal(pickReflectionFromPages({ dataset, meta, pool, pages: [] }), null);
  assert.equal(pickReflectionFromPages({ dataset, meta, pool, pages: [9999] }), null);
});

/* ---- 2. Repeat avoidance ---- */
check("R4: a recent ayah is skipped in favour of a fresh one on the same pages", () => {
  const pages = Array.from({ length: 25 }, (_, i) => i + 1);
  const all = refsOn(pages);
  assert.ok(all.length >= 2, "these pages contain more than one ayah");
  const first = pickReflectionFromPages({ dataset, meta, pool, pages });
  const second = pickReflectionFromPages({ dataset, meta, pool, pages, history: [first] });
  assert.ok(second);
  assert.notEqual(second, first, "the just-used ayah is not repeated");
  assert.ok(all.includes(second));
});

check("R5: curated (tafsir-backed) ayahs are preferred when present on the pages", () => {
  const curated = new Set(pool);
  // Find a real page that prints a curated ayah, using the shipped pagination.
  let curatedPage = null;
  for (let p = 1; p <= 604 && curatedPage === null; p += 1) {
    if (pageAyahs(dataset, meta, p).some((a) => curated.has(a.ref))) curatedPage = p;
  }
  assert.ok(curatedPage, "a curated ayah appears on at least one real page");
  const ref = pickReflectionFromPages({ dataset, meta, pool, pages: [curatedPage] });
  assert.ok(ref);
  assert.ok(curated.has(ref), `${ref} has a reflection question and tafsir`);
});

check("R6: with no curated ayah it still returns a real ayah from those pages (honest fallback)", () => {
  // Pick a page range far from the small curated pool.
  const pages = [400, 401];
  const ref = pickReflectionFromPages({ dataset, meta, pool: [], pages });
  assert.ok(ref, "an authentic page-local ayah is returned, nothing fabricated");
  assert.ok(refsOn(pages).includes(ref));
});

/* ---- 3. Wiring proof ---- */
check("R7: the reader and reflection UI really use the page-grounded ayah", () => {
  const reader = readFileSync(join(ROOT, "src", "components", "views", "MushafReader.tsx"), "utf8");
  const calls = reader.match(/quran\.setWardReflection\(res\.recordedPages\)/g) ?? [];
  assert.equal(calls.length, 2, "both completion paths must ground the reflection");
  /* A custom range is still real reading: the reflection must not disappear
     just because it is not today's assigned ward. */
  const guards = braceBlocks(reader, "if (!customRange) {");
  assert.ok(guards.length > 0, "the custom-range guard must still exist");
  assert.ok(
    guards.every((body) => !body.includes("setWardReflection")),
    "reflection must not be gated behind !customRange"
  );
  const hook = readFileSync(join(ROOT, "src", "hooks", "useQuran.ts"), "utf8");
  assert.match(hook, /pickReflectionFromPages\(\{/);
  const sheet = readFileSync(join(ROOT, "src", "components", "TadabburSheet.tsx"), "utf8");
  assert.match(sheet, /quran\.reflectionAyah \|\| quran\.daily\?\.ref/);
  assert.match(sheet, /\{t\("tadabbur\.fullTafsir"\)\}/);
  const home = readFileSync(join(ROOT, "src", "components", "views", "Home.tsx"), "utf8");
  assert.match(home, /quran\.reflectionAyah \|\| quran\.daily\?\.ref/);
  assert.match(home, /\{dailyTafsir\.reflection\}/, "the Home card shows the reflection question");
  assert.ok(existsSync(join(ROOT, "src", "lib", "quran", "reflection.ts")));
});

check("R8: a seen curated ayah is skipped while a fresh page-local ayah exists", () => {
  const curated = new Set(pool);
  let target = null;
  for (let p = 1; p <= 604 && target === null; p += 1) {
    const onPage = pageAyahs(dataset, meta, p).map((a) => a.ref);
    const curatedOnPage = onPage.filter((r) => curated.has(r));
    const freshOnPage = onPage.filter((r) => !curated.has(r));
    if (curatedOnPage.length === 1 && freshOnPage.length >= 1) {
      target = { page: p, used: curatedOnPage[0], fresh: freshOnPage };
    }
  }
  assert.ok(target, "a real page has one curated and at least one non-curated ayah");
  const ref = pickReflectionFromPages({
    dataset, meta, pool,
    pages: [target.page],
    history: [target.used],
  });
  assert.ok(ref);
  assert.notEqual(ref, target.used, "the recently used curated ayah must not win again");
  assert.ok(target.fresh.includes(ref), `${ref} is a fresh ayah printed on the same page`);
});

for (const { name, fn } of checks) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
console.log(`\nReflection grounding: ${passed}/${checks.length} checks passed`);
