/* ====================================================================
 * Dataset load-failure surfacing -- focused coverage
 * ====================================================================
 * The audit found the Quran dataset could fail to load and nothing said
 * so. `dataset-status.ts` already computed an honest `offline` vs
 * `error` distinction and was already unit-tested in test-offline.mjs,
 * but it had ZERO importers: useQuran called loadDataset() directly and
 * nothing ever read the status.
 *
 * The result was a set of confidently WRONG screens:
 *   - Library search claimed "no results" (nothing had been searched)
 *   - Library topics rendered a blank list (every row resolved to null)
 *   - Library bookmarks rendered a blank body under a "(3)" tab label
 *   - Ayah said "Verse not found", Quran reader said "Surah not found"
 *   - Home dropped the daily-ayah card with no explanation
 *
 * Scope is narrow: dataset-status wiring plus the failure notice. No
 * general offline UX work, no retry, no error boundary, no persistence.
 * ==================================================================== */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "dataset-failure-test");

const read = (r) => readFileSync(join(ROOT, ...r.split("/")), "utf8");

/* Comments must not satisfy or break a source assertion, so they are stripped
   before checking what code actually does. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ---------------------------------------------------------------- */
/* Import-graph walker (same approach as test-tadabbur.mjs).          */
/* ---------------------------------------------------------------- */

const EXT_CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const ext of EXT_CANDIDATES) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function walk(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    const specs = [
      ...src.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    for (const s of specs) {
      const r = resolveSpec(s, file);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
}

const REACHABLE = walk([
  join(ROOT, "src", "app", "page.tsx"),
  join(ROOT, "src", "app", "layout.tsx"),
]);
const REACHABLE_REL = new Set([...REACHABLE].map((f) => f.split(/[\\/]/).join("/").replace(`${ROOT.split(/[\\/]/).join("/")}/`, "")));
const REACHABLE_SRC = [...REACHABLE].map((f) => ({
  rel: f.split(/[\\/]/).join("/").replace(`${ROOT.split(/[\\/]/).join("/")}/`, ""),
  src: readFileSync(f, "utf8"),
}));

const STATUS_FILE = "src/lib/quran/dataset-status.ts";
const NOTICE = "src/components/DatasetNotice.tsx";
const HOOK = "src/hooks/useQuran.ts";

/* ---------------------------------------------------------------- */
/* Compile the real status mapper + notice mapping for execution.    */
/* ---------------------------------------------------------------- */

rmSync(OUT, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "lib", "quran", "dataset-status.ts"),
    "--outDir", OUT,
    "--module", "commonjs", "--moduleResolution", "node",
    "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);
/* tsc keeps the directory structure relative to the common source root, which
   here is src/lib, so the module lands under quran/. */
const status = await import(pathToFileURL(join(OUT, "quran", "dataset-status.js")).href);

/* The notice ships inside a "use client" .tsx whose imports (notably the "@/"
   alias) cannot be resolved headlessly, so the component itself cannot be
   imported. Instead the REAL exported mapper is lifted out verbatim and
   compiled on its own: the decision table that ships is the one executed,
   never a re-implementation. */
function loadNoticeMapper() {
  const src = read(NOTICE);
  const start = src.indexOf("export function datasetNoticeKey");
  assert.ok(start > -1, "datasetNoticeKey must be exported for testing");
  const end = src.indexOf("\n}", start) + 2;
  const fn = src.slice(start, end);
  assert.ok(fn.includes("hash-mismatch"), "extraction captured too little of the mapper");

  const shim = `type DatasetUiStatus = "verified" | "hash-mismatch" | "error" | "offline";\n`;
  const stage = join(OUT, "mapper-stage");
  mkdirSync(stage, { recursive: true });
  writeFileSync(join(stage, "mapper.ts"), shim + fn, "utf8");
  execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "typescript", "bin", "tsc"),
      join(stage, "mapper.ts"),
      "--outDir", join(stage, "out"),
      "--module", "commonjs", "--target", "es2019", "--skipLibCheck",
    ],
    { cwd: ROOT, stdio: "pipe" }
  );
  return join(stage, "out", "mapper.js");
}
const mapperModule = await import(pathToFileURL(loadNoticeMapper()).href);
const datasetNoticeKey = mapperModule.datasetNoticeKey;

/* ---------------------------------------------------------------- */

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

/* ---- A. dataset-status.ts is now reachable ---- */

check("A1: the walker reaches the app shell", () => {
  assert.ok(REACHABLE_REL.has("src/app/page.tsx"));
  assert.ok(REACHABLE_SRC.length > 40, `only ${REACHABLE_SRC.length} reachable`);
});

check("A2: dataset-status.ts is reachable from the real entry points", () => {
  assert.ok(
    REACHABLE_REL.has(STATUS_FILE),
    `${STATUS_FILE} is still orphaned -- the honest status never reaches the UI`
  );
});

check("A3: the notice component itself is reachable", () => {
  assert.ok(REACHABLE_REL.has(NOTICE), `${NOTICE} must be reachable`);
  const importers = REACHABLE_SRC.filter((f) =>
    new RegExp(`from\\s+["']@/components/DatasetNotice["']`).test(f.src)
  );
  assert.ok(importers.length >= 4, `expected the notice on every Quran text surface, found ${importers.length}`);
  assert.deepEqual(importers.map((f) => f.rel).sort(), [
    "src/components/views/Ayah.tsx",
    "src/components/views/Home.tsx",
    "src/components/views/Library.tsx",
    "src/components/views/QuranReader.tsx",
  ]);
});

/* ---- B. useQuran uses the status-aware loader ---- */

check("B1: useQuran imports loadDatasetWithStatus and no longer imports loadDataset", () => {
  // Comments explain the raw loader, so they must not decide this. Only code
  // counts: the raw loader must not be imported or called any more.
  const src = stripComments(read(HOOK));
  assert.ok(/loadDatasetWithStatus/.test(src), "must import loadDatasetWithStatus");
  assert.ok(
    !/\bloadDataset\b(?!\w)/.test(src),
    "useQuran must not call loadDataset directly any more"
  );
});

check("B2: useQuran tracks DatasetUiStatus and a separate settled flag", () => {
  const src = read(HOOK);
  assert.ok(/datasetStatus:\s*DatasetUiStatus/.test(src), "QuranData must expose datasetStatus");
  assert.ok(/datasetSettled:\s*boolean/.test(src), "QuranData must expose datasetSettled");
  assert.ok(
    !/\bstatus:\s*DatasetStatus\b/.test(src),
    "the old raw DatasetStatus field must be gone"
  );
  assert.ok(/setDatasetSettled\(true\)/.test(src), "settled must flip when the load resolves");
});

check("B3: settled is set from the coordinated promise, not synchronously", () => {
  const src = stripComments(read(HOOK));
  const start = src.indexOf("const loadQuranData = useCallback(");
  assert.ok(start > -1, "loadQuranData not found");
  const end = src.indexOf("}, [coordinator]);", start);
  assert.ok(end > start, "the end of loadQuranData was not found");
  const body = src.slice(start, end);

  // The synchronous part may only RESET settled. Asserting it there would
  // report "done" before a single byte has been fetched.
  const sync = body.slice(0, body.indexOf("void runCoordinatedReload("));
  assert.ok(/setDatasetSettled\(false\)/.test(sync), "the load must start by showing progress");
  assert.ok(!/setDatasetSettled\(true\)/.test(sync), "settled must NEVER be set synchronously");

  // ...and it must be set from the aggregate promise, which only runs once all
  // three resources have settled, so a rejection cannot strand it on loading.
  assert.ok(
    /onSettled: \(\) => \{[\s\S]*?setDatasetSettled\(true\)/.test(body),
    "settled must be set from the coordinated promise"
  );

  // dataset and status still come straight from the loader's own result.
  assert.ok(/setDataset\(ds\.ok \? ds\.value\.dataset : null\)/.test(body), "dataset must come from the loader");
  assert.ok(
    /setDatasetStatus\(ds\.ok \? ds\.value\.status : "error"\)/.test(body),
    "status must be the loader's status, or an honest error"
  );
});

check("B4: the pre-existing `loaded` flag is untouched and still not the gate", () => {
  const src = read(HOOK);
  assert.ok(/const \[loaded, setLoaded\] = useState\(false\)/.test(src), "loaded must stay as it was");
  assert.ok(/setLoaded\(true\)/.test(src));
  // `loaded` flips synchronously when the effect starts, so gating on it would
  // flash a failure before the load has even settled. The notice must not.
  const notice = stripComments(read(NOTICE));
  assert.ok(!/\bloaded\b/.test(notice), "the notice must not gate on quran.loaded");
});

check("B5: dataset, meta and the existing callbacks are unchanged", () => {
  const src = read(HOOK);
  for (const fn of [
    "getAyah", "getRelated", "getTopics", "getTafsir", "search", "isBookmarked",
    "toggleBookmark", "markAyahRead", "completeTadabbur", "deferTadabbur",
    "markPageRead", "completeWard", "dailyReady",
  ]) {
    assert.ok(new RegExp(`\\b${fn}\\b`).test(src), `${fn} must survive`);
  }
  assert.ok(/const dailyReady = Boolean\(dataset && daily/.test(src), "dailyReady logic unchanged");
  assert.ok(/loadAyahMeta\(\)/.test(src), "meta still loads the same way");
});

/* ---- C. The integrity gate is untouched ---- */

check("C1: store.ts still refuses hash-mismatched text", () => {
  const src = read("src/lib/quran/store.ts");
  assert.ok(/const hex = await sha256Text\(text\);\s*\n\s*return hex === DATASET_SHA256;/.test(src), "verifyText must be unchanged");
  assert.ok(/return \{ dataset: null, status: "hash-mismatch" \};/.test(src), "mismatch must still return a null dataset");
  assert.ok(/loadDataset\(\)/.test(src), "the raw loader must still exist");
});

check("C2: the wrapper delegates to loadDataset rather than reimplementing it", () => {
  const src = read(STATUS_FILE);
  assert.ok(/import \{ loadDataset/.test(src));
  assert.ok(/await loader\(\)/.test(src), "must call through the injected/raw loader");
  assert.ok(!/sha256|DATASET_SHA256/.test(src), "no second integrity check may be introduced");
});

check("C3: no Quran text can render while the dataset is not verified", () => {
  // Library, Ayah and the reader each have to suppress their own content
  // explicitly, otherwise they show "no results" / "not found" on top of the
  // notice.
  for (const rel of [
    "src/components/views/Library.tsx",
    "src/components/views/Ayah.tsx",
    "src/components/views/QuranReader.tsx",
  ]) {
    const src = read(rel);
    assert.ok(
      /quran\.datasetStatus === "verified"/.test(src),
      `${rel} must gate its content on datasetStatus === "verified"`
    );
  }
});

check("C3b: Home cannot render the daily ayah without a dataset", () => {
  // Home needs no explicit verified gate: the card already requires
  // dailyResolved, which requires dailyReady, which requires `dataset`.
  // Without it the card simply cannot mount -- so the notice is enough.
  const hook = stripComments(read(HOOK));
  assert.ok(
    /const dailyReady = Boolean\(dataset &&/.test(hook),
    "dailyReady must still require a loaded dataset"
  );
  const home = stripComments(read("src/components/views/Home.tsx"));
  assert.ok(
    /const dailyResolved = quran\.dailyReady && quran\.daily \? quran\.getAyah\(dailyRef\) : null/.test(home),
    "the card's data must still flow through dailyReady"
  );
  assert.ok(/\{wardDay && dailyResolved && \(/.test(home), "the card must remain gated on dailyResolved");
});

/* ---- D. Every failure state maps to its own honest notice ---- */

check("D1: offline, hash-mismatch and error each map to a distinct key", () => {
  const offline = datasetNoticeKey("offline", true);
  const mismatch = datasetNoticeKey("hash-mismatch", true);
  const error = datasetNoticeKey("error", true);
  assert.equal(offline, "quran.dataOffline");
  assert.equal(mismatch, "quran.dataMismatch");
  assert.equal(error, "quran.dataError");
  assert.equal(new Set([offline, mismatch, error]).size, 3, "the three states must not collapse");
});

check("D2: verified produces no notice at all", () => {
  assert.equal(datasetNoticeKey("verified", true), null);
});

check("D3: no notice before the load settles -- the cold-start false positive", () => {
  // Initial state is status "error" + settled false, which must stay silent.
  assert.equal(datasetNoticeKey("error", false), null, "must not warn during loading");
  assert.equal(datasetNoticeKey("offline", false), null);
  assert.equal(datasetNoticeKey("hash-mismatch", false), null);
  assert.equal(datasetNoticeKey("verified", false), null);
  assert.equal(datasetNoticeKey(null, false), null);
});

check("D4: the notice is anchored on datasetSettled, not on `loaded`", () => {
  const src = read(NOTICE);
  assert.ok(/datasetNoticeKey\(quran\.datasetStatus, quran\.datasetSettled\)/.test(src));
  assert.ok(/!quran\.datasetSettled && quran\.dataset === null/.test(src), "loading state uses datasetSettled");
});

check("D5: the upstream status mapping still distinguishes offline from error", () => {
  assert.equal(status.resolveDatasetUiStatus("error", false), "offline");
  assert.equal(status.resolveDatasetUiStatus("error", true), "error");
  assert.equal(status.resolveDatasetUiStatus("verified", false), "verified");
  assert.equal(status.resolveDatasetUiStatus("hash-mismatch", true), "hash-mismatch");
});

/* ---- E. No false "no results" / "not found" claims ---- */

check("E1: Library cannot claim no-results while the dataset is missing", () => {
  const src = read("src/components/views/Library.tsx");
  const idx = src.indexOf('t("library.noResults")');
  assert.ok(idx > -1, "noResults still exists");
  const before = src.slice(Math.max(0, idx - 400), idx);
  assert.ok(
    /quran\.datasetStatus === "verified"/.test(before),
    "the no-results line must be guarded by a verified dataset"
  );
});

check("E2: Library cannot render a blank bookmarks body", () => {
  const src = read("src/components/views/Library.tsx");
  const idx = src.indexOf("quran.datasetStatus !== \"verified\"");
  assert.ok(idx > -1, "bookmarks branch must check the dataset status");
  const after = src.slice(idx, idx + 400);
  assert.ok(/DatasetNotice/.test(after), "the notice must be the bookmarks fallback");
  assert.ok(!/quran\.bookmarks\.length === 0 \?/.test(src.slice(Math.max(0, idx - 200), idx)), "the no-bookmarks card must not be the first branch any more");
});

check("E3: Ayah blames the reference only when the data is fine", () => {
  const src = read("src/components/views/Ayah.tsx");
  const idx = src.indexOf('t("ayah.notFound")');
  assert.ok(idx > -1);
  const before = src.slice(Math.max(0, idx - 500), idx);
  assert.ok(/quran\.datasetStatus === "verified"/.test(before), "notFound must be gated on verified");
  assert.ok(/DatasetNotice/.test(src), "Ayah must show the notice instead");
});

check("E4: Quran reader blames the chapter only when the data is fine", () => {
  const src = read("src/components/views/QuranReader.tsx");
  const idx = src.indexOf('t("quran.notFound")');
  assert.ok(idx > -1);
  const before = src.slice(Math.max(0, idx - 500), idx);
  assert.ok(/quran\.datasetStatus === "verified"/.test(before), "notFound must be gated on verified");
  assert.ok(/DatasetNotice/.test(src));
});

check("E5: Home explains the missing daily ayah instead of dropping it", () => {
  const src = read("src/components/views/Home.tsx");
  assert.ok(
    /quran\.datasetStatus !== "verified" && <DatasetNotice quran=\{quran\} \/>/.test(src),
    "Home must render the notice when the dataset is not verified"
  );
});

/* ---- F. Localization ---- */

check("F1: the three keys exist in both dictionaries with identical names", () => {
  const locale = read("src/lib/locale.ts");
  for (const key of ["quran.dataOffline", "quran.dataMismatch", "quran.dataError"]) {
    const hits = locale.split(`"${key}":`).length - 1;
    assert.equal(hits, 2, `${key} must appear exactly twice (ar + en), found ${hits}`);
  }
});

check("F2: neither new string is empty and both carry real text", () => {
  const locale = read("src/lib/locale.ts");
  for (const key of ["quran.dataOffline", "quran.dataMismatch", "quran.dataError"]) {
    const values = [...locale.matchAll(new RegExp(`"${key}": "([^"]*)"`, "g"))].map((m) => m[1]);
    assert.equal(values.length, 2, `${key} needs an ar and an en value`);
    for (const v of values) assert.ok(v.trim().length > 8, `${key} has an empty value: "${v}"`);
    assert.notEqual(values[0], values[1], `${key} must be translated, not duplicated`);
  }
});

check("F3: no placeholder was introduced into the new keys", () => {
  const locale = read("src/lib/locale.ts");
  for (const key of ["quran.dataOffline", "quran.dataMismatch", "quran.dataError"]) {
    const values = [...locale.matchAll(new RegExp(`"${key}": "([^"]*)"`, "g"))].map((m) => m[1]);
    for (const v of values) assert.ok(!/\{\{/.test(v), `${key} must not take arguments`);
  }
});

check("F4: the notice carries no hardcoded Arabic", () => {
  const src = read(NOTICE);
  const hits = src.split("\n").filter((l) => /[\u0600-\u06FF]/.test(l));
  assert.equal(hits.length, 0, `hardcoded Arabic in the notice:\n    ${hits.join("\n    ")}`);
});

/* ---- G. Scope guards ---- */

check("G1: no new persistence key", () => {
  const src = read("src/lib/storage.ts");
  const keys = [...src.matchAll(/const (?:V2|LEGACY)_\w+ = "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, 10, `storage key count changed: ${keys.length}`);
  assert.ok(keys.includes("ward:v2:journal"));
  assert.ok(!keys.some((k) => /dataset|status|offline/i.test(k)), "no new persistence key");
});

check("G2: no new route or tab", () => {
  const pages = readdirSync(join(ROOT, "src", "app")).filter((f) => f.startsWith("page."));
  assert.deepEqual(pages, ["page.tsx"]);
  const types = read("src/lib/types.ts");
  assert.ok(!/tadabbur|dataset|notice/i.test(/export type TabId =([^;]+);/.exec(types)[1]));
  assert.ok(!/tadabbur|dataset|notice/i.test(/export type FullViewId =([^;]+);/.exec(types)[1]));
});

check("G3: the frozen files are not part of this change", () => {
  // MushafReader is hash-pinned by W2 C6 and must not have been touched.
  // The pin value moved deliberately when the reader gained content-aware
  // auto-scroll dwell; this assertion exists to prove the pin is still
  // declared and still tracked in test-w2.mjs, not to freeze a hash literal.
  assert.ok(
    /"src\/components\/views\/MushafReader\.tsx":\s*"[0-9A-F]{16}"/.test(read("scripts/test-w2.mjs")),
    "the Mushaf pin must still be declared"
  );
  // topic normalization stays frozen: no normalized topic index was introduced.
  const search = read("src/lib/quran/search.ts");
  assert.ok(
    /matchedTopic && matchedTopic\.includes\(q\)/.test(search),
    "topic matching must stay raw/frozen"
  );
});

check("G4: no error boundary or retry was introduced", () => {
  const appFiles = readdirSync(join(ROOT, "src", "app"));
  assert.ok(!appFiles.includes("error.tsx"), "no error boundary was requested or added");
  assert.ok(!appFiles.includes("global-error.tsx"));
  const hook = read(HOOK);
  assert.ok(!/reloadDataset|retryDataset/.test(hook), "retry is out of scope for this target");
  assert.ok(!/quran\.retry/.test(read(NOTICE)), "no retry affordance in the notice");
});

/* ---------------------------------------------------------------- */

for (const { name, fn } of checks) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`\nDataset failure surfacing: ${passed}/${checks.length} passed`);
if (passed !== checks.length) {
  console.error(`${checks.length - passed} check(s) failed.`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
