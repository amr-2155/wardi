import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "quran-test");

const dataset = JSON.parse(readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8"));
const hashes = JSON.parse(readFileSync(join(ROOT, "public", "quran", "hashes.json"), "utf8"));
const relations = JSON.parse(readFileSync(join(ROOT, "src", "data", "quran", "ayah-relations.json"), "utf8"));
const topics = JSON.parse(readFileSync(join(ROOT, "src", "data", "quran", "topics.json"), "utf8"));
const tafsir = JSON.parse(readFileSync(join(ROOT, "src", "data", "quran", "tafsir.json"), "utf8"));
const tafsirEntries = tafsir.entries;
const constSrc = readFileSync(join(ROOT, "src", "lib", "quran", "dataset.const.ts"), "utf8");

const DATASET_SHA256 = /DATASET_SHA256 = "([0-9a-f]+)"/.exec(constSrc)?.[1] ?? "";

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  "validate",
  "daily",
  "relations",
  "search",
  "normalize",
  "tafsir",
  "types",
].map((f) => join(ROOT, "src", "lib", "quran", `${f}.ts`));

execFileSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "bin", "tsc"), ...libFiles, "--outDir", OUT, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node"],
  { cwd: ROOT, stdio: "pipe" }
);

const { validateAyah, validateAyahReference, verifyAyahHash, sha256Text, getGlobalId, resolveAyah, parseAyahRef } = await import(
  pathToFileURL(join(OUT, "validate.js")).href
);
const { getDailyAyah } = await import(pathToFileURL(join(OUT, "daily.js")).href);
const { getRelatedAyahs, isDailyCandidate } = await import(pathToFileURL(join(OUT, "relations.js")).href);
const { searchQuran } = await import(pathToFileURL(join(OUT, "search.js")).href);
const { normalizeArabic } = await import(pathToFileURL(join(OUT, "normalize.js")).href);
const { getTafsir, tadabburPool, validateTafsirEntry } = await import(
  pathToFileURL(join(OUT, "tafsir.js")).href
);
const { RELATED_TYPES } = await import(pathToFileURL(join(OUT, "types.js")).href);

const ALLOWED_TYPES = [...RELATED_TYPES];
let passed = 0;
const checks = [];
const check = (name, fn) => {
  checks.push({ name, fn });
};

// ---- A. Dataset integrity ----
check("dataset has 6236 ayahs across 114 chapters", () => {
  assert.equal(dataset.manifest.totalAyahs, 6236);
  assert.equal(dataset.chapters.length, 114);
});
check("hashes.json covers every ayah", () => {
  assert.equal(hashes.length, dataset.manifest.totalAyahs);
});
check("quran.json sha256 matches generated constant", async () => {
  const hex = createHash("sha256").update(readFileSync(join(ROOT, "public", "quran", "quran.json"))).digest("hex");
  assert.equal(hex, DATASET_SHA256);
});

// ---- B. validateAyah / validateAyahReference ----
check("validateAyah accepts valid verse", () => {
  assert.equal(validateAyah({ number: 1, text: "بِسْمِ ٱللَّهِ" }), true);
  assert.equal(validateAyah({ number: 20, text: "طه" }), true);
});
check("validateAyah rejects malformed verse", () => {
  assert.equal(validateAyah(null), false);
  assert.equal(validateAyah({}), false);
  assert.equal(validateAyah({ number: 0, text: "x" }), false);
  assert.equal(validateAyah({ number: 1.5, text: "x" }), false);
  assert.equal(validateAyah({ number: 1, text: "   " }), false);
  assert.equal(validateAyah({ number: "1", text: "x" }), false);
});
check("validateAyahReference accepts real refs and rejects invalid", () => {
  for (const ref of ["1:1", "1:7", "2:255", "2:286", "94:5", "114:6"]) {
    assert.equal(validateAyahReference(ref, dataset), true, ref);
  }
  for (const ref of ["1:8", "1:0", "115:1", "0:1", "2:287", "abc", "2", "2:"] ) {
    assert.equal(validateAyahReference(ref, dataset), false, ref);
  }
});
check("parseAyahRef bounds", () => {
  assert.deepEqual(parseAyahRef("2:255"), { surah: 2, ayah: 255 });
  assert.equal(parseAyahRef("2:0"), null);
  assert.equal(parseAyahRef("115:1"), null);
  assert.equal(parseAyahRef("x"), null);
});

// ---- C. verifyAyahHash ----
check("per-ayah hashes match for known ayahs", async () => {
  for (const [ref, surah, ayah] of [["1:1", 1, 1], ["2:255", 2, 255], ["94:5", 94, 5]]) {
    const gid = getGlobalId(surah, ayah, dataset.chapters);
    const text = resolveAyah(ref, dataset).verse.text;
    assert.equal(await verifyAyahHash(gid, text, hashes[gid - 1]), true, ref);
  }
});
check("verifyAyahHash fails on tampered text", async () => {
  const gid = getGlobalId(1, 1, dataset.chapters);
  assert.equal(await verifyAyahHash(gid, hashes ? "مُعَدَّل" : "", hashes[gid - 1]), false);
});
check("whole-file sha256 matches string-utf8 sha256 (runtime gate)", async () => {
  const text = readFileSync(join(ROOT, "public", "quran", "quran.json"), "utf8");
  assert.equal(await sha256Text(text), DATASET_SHA256);
});

// ---- D. getDailyAyah ----
check("daily ayah is deterministic for a given date", () => {
  const date = new Date("2026-08-10T12:00:00");
  const a = getDailyAyah(date, dataset, dailyPool(), []);
  const b = getDailyAyah(date, dataset, dailyPool(), []);
  assert.equal(a.ref, b.ref);
  assert.equal(a.dateKey, "2026-08-10");
});
check("daily ayah changes across days", () => {
  const pool = dailyPool();
  const refs = [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(2026, 7, 10 + i);
    return getDailyAyah(d, dataset, pool, []).ref;
  });
  assert.ok(new Set(refs).size >= 2, `refs: ${refs.join(", ")}`);
});
check("daily ayah skips recent refs when possible", () => {
  const date = new Date("2026-08-10T12:00:00");
  const pool = dailyPool();
  const first = getDailyAyah(date, dataset, pool, []).ref;
  const second = getDailyAyah(date, dataset, pool, [first]);
  assert.notEqual(second.ref, first);
  assert.ok(![first].includes(second.ref));
});
check("daily ayah is always a valid curated ref", () => {
  const pool = dailyPool();
  for (let i = 0; i < 30; i += 1) {
    const sel = getDailyAyah(new Date(2026, 0, 1 + i), dataset, pool, []);
    assert.ok(pool.includes(sel.ref), sel.ref);
    assert.ok(isDailyCandidate(sel.ref, relations, topics.topics));
    assert.ok(validateAyahReference(sel.ref, dataset));
  }
});

// ---- E. Relations & topics integrity ----
check("every relation reference resolves in the dataset", () => {
  for (const entry of relations.entries) {
    assert.ok(validateAyahReference(entry.sourceAyah, dataset), entry.sourceAyah);
    for (const r of entry.relatedAyahs) {
      assert.ok(validateAyahReference(r.ayah, dataset), `${entry.sourceAyah} -> ${r.ayah}`);
    }
  }
});
check("every topic ayah resolves in the dataset", () => {
  for (const t of topics.topics) {
    for (const ref of t.ayahs) assert.ok(validateAyahReference(ref, dataset), `${t.name}: ${ref}`);
  }
});
check("relation types are from allowed set and never 'synonym'", () => {
  for (const entry of relations.entries) {
    for (const r of entry.relatedAyahs) {
      assert.notEqual(r.relationType, "synonym");
      assert.ok(ALLOWED_TYPES.includes(r.relationType), `${entry.sourceAyah}: ${r.relationType}`);
    }
  }
});
check("getRelatedAyahs returns verified refs only", () => {
  const entry = getRelatedAyahs("2:153", relations, dataset);
  assert.ok(entry);
  assert.equal(entry.relatedAyahs.length, 3);
  assert.ok(entry.relatedAyahs.every((r) => r.verified));
  assert.equal(getRelatedAyahs("1:1", relations, dataset), null);
});
check("getRelatedAyahs filters unverified / invalid refs", () => {
  const fake = JSON.parse(JSON.stringify(relations));
  fake.entries[0].relatedAyahs.push(
    { ayah: "2:153", relationType: "theme", reason: "x", verified: false, source: "t" },
    { ayah: "1:8", relationType: "theme", reason: "x", verified: true, source: "t" }
  );
  const entry = getRelatedAyahs(fake.entries[0].sourceAyah, fake, dataset);
  assert.equal(entry.relatedAyahs.length, 3);
  assert.ok(entry.relatedAyahs.every((r) => r.verified && validateAyahReference(r.ayah, dataset)));
});

// ---- F. Search ----
check("search finds verses by normalized text", () => {
  const res = searchQuran("طه", dataset, topics.topics, 100);
  assert.ok(res.some((r) => r.ref === "20:1"), JSON.stringify(res.map((r) => r.ref)));
  const res2 = searchQuran("يسر", dataset, topics.topics, 1000);
  assert.ok(res2.some((r) => r.ref === "94:5"), JSON.stringify(res2.map((r) => r.ref)));
});
check("search finds verses by topic name", () => {
  const res = searchQuran("الاستغفار", dataset, topics.topics, 1000);
  assert.ok(res.some((r) => r.ref === "71:10"), JSON.stringify(res.map((r) => r.ref)));
});
check("search handles empty query", () => {
  assert.deepEqual(searchQuran("", dataset, topics.topics), []);
});
check("normalizeArabic strips diacritics and unifies alifs", () => {
  assert.ok(normalizeArabic("فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا").includes("يسرا"));
  assert.equal(normalizeArabic("ألقرآن وإٓلذكر"), normalizeArabic("القران والذكر"));
  assert.equal(normalizeArabic("مُوسَى ٱلْيَد"), normalizeArabic("موسي اليد"));
});

// ---- G. Tafsir integrity ----
check("tafsir dataset has 24 curated entries", () => {
  assert.equal(tafsirEntries.length, 24);
});
check("every tafsir ref resolves in the dataset", () => {
  for (const entry of tafsirEntries) {
    assert.ok(validateAyahReference(entry.ref, dataset), entry.ref);
  }
});
check("tafsir refs are unique", () => {
  assert.equal(new Set(tafsirEntries.map((t) => t.ref)).size, tafsirEntries.length);
});
check("every tafsir entry passes validateTafsirEntry", () => {
  for (const entry of tafsirEntries) assert.equal(validateTafsirEntry(entry), true, entry.ref);
});
check("every tafsir entry has complete required fields", () => {
  for (const entry of tafsirEntries) {
    assert.ok(entry.simplifiedMeaning.trim().length > 10, `${entry.ref}: meaning`);
    assert.ok(entry.simplerMeaning.trim().length > 5, `${entry.ref}: simpler`);
    assert.equal(entry.howToLive.length, 2, `${entry.ref}: howToLive`);
    assert.ok(entry.howToLive.every((p) => p.trim().length > 5), `${entry.ref}: howToLive points`);
    assert.ok(entry.reflection.trim().length > 5, `${entry.ref}: reflection`);
    assert.equal(entry.reviewStatus, "reviewed", entry.ref);
    assert.ok(entry.tafsirSource.length > 0, entry.ref);
  }
});
check("getTafsir finds entries and misses others", () => {
  assert.ok(getTafsir("2:255", tafsirEntries));
  assert.ok(getTafsir("94:5", tafsirEntries));
  assert.equal(getTafsir("1:1", tafsirEntries), null);
  assert.equal(getTafsir("2:1", tafsirEntries), null);
});
check("tadabburPool is non-empty and matches curated refs", () => {
  const pool = tadabburPool(tafsirEntries, dataset);
  assert.equal(pool.length, tafsirEntries.length);
  for (const entry of tafsirEntries) assert.ok(pool.includes(entry.ref), entry.ref);
});
check("daily ayah always comes from the tafsir pool", () => {
  const pool = tadabburPool(tafsirEntries, dataset);
  for (let i = 0; i < 60; i += 1) {
    const sel = getDailyAyah(new Date(2026, 0, 1 + i), dataset, pool, []);
    assert.ok(pool.includes(sel.ref), sel.ref);
    assert.ok(getTafsir(sel.ref, tafsirEntries), sel.ref);
  }
});

// ---- runner ----
for (const { name, fn } of checks) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function dailyPool() {
  return tadabburPool(tafsirEntries, dataset);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
console.log(`\n${passed}/${checks.length} checks passed`);
