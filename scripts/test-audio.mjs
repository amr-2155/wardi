import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "audio-test");

rmSync(OUT, { recursive: true, force: true });
const libFiles = [
  "types",
  "quran-com",
  "storage",
].map((f) => join(ROOT, "src", "lib", "audio", `${f}.ts`));

execFileSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "bin", "tsc"), ...libFiles, "--outDir", OUT, "--module", "commonjs", "--moduleResolution", "node", "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node"],
  { cwd: ROOT, stdio: "pipe" }
);

// tsc mirrors inputs relative to their common root: compiling only
// src/lib/audio/*.ts emits a flat OUT/ layout, while an import reaching
// outside that folder (e.g. the shared net layer) nests output under
// OUT/audio/. Resolve both layouts so the harness is robust either way.
const outFile = (name) => {
  const nested = join(OUT, "audio", name);
  return existsSync(nested) ? nested : join(OUT, name);
};

const {
  isValidSurahNumber,
  normalizeSurahNumber,
} = await import(pathToFileURL(outFile("types.js")).href);

const {
  parseReciters,
  quranComProvider,
  resolveAudioUrl,
  deriveVersePrefix,
  buildVerseUrl,
} = await import(pathToFileURL(outFile("quran-com.js")).href);

let passed = 0;
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

// Provide a minimal localStorage mock for Node.js test environment.
const store = {};
globalThis.localStorage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
  removeItem(key) {
    delete store[key];
  },
  clear() {
    for (const k of Object.keys(store)) delete store[k];
  },
};

// ---- A. Surah number validation ----
check("isValidSurahNumber accepts 1..114", () => {
  assert.equal(isValidSurahNumber(1), true);
  assert.equal(isValidSurahNumber(114), true);
  assert.equal(isValidSurahNumber(94), true);
});

check("isValidSurahNumber rejects 0, 115, negatives, non-integers", () => {
  assert.equal(isValidSurahNumber(0), false);
  assert.equal(isValidSurahNumber(115), false);
  assert.equal(isValidSurahNumber(-1), false);
  assert.equal(isValidSurahNumber(1.5), false);
  assert.equal(isValidSurahNumber(NaN), false);
  assert.equal(isValidSurahNumber(Infinity), false);
});

// ---- B. normalizeSurahNumber ----
check("normalizeSurahNumber accepts valid string/number", () => {
  assert.equal(normalizeSurahNumber(2), 2);
  assert.equal(normalizeSurahNumber("2"), 2);
  assert.equal(normalizeSurahNumber("002"), 2);
  assert.equal(normalizeSurahNumber("114"), 114);
});

check("normalizeSurahNumber rejects invalid inputs", () => {
  assert.equal(normalizeSurahNumber(0), null);
  assert.equal(normalizeSurahNumber(115), null);
  assert.equal(normalizeSurahNumber(-1), null);
  assert.equal(normalizeSurahNumber("abc"), null);
  assert.equal(normalizeSurahNumber(""), null);
});

// ---- C. Reciter parsing ----
check("parseReciters handles well-formed API response", () => {
  const raw = {
    recitations: [
      { id: 1, recitation_name: "Mishary Rashid Al-Afasy", translated_name: { name: "Mishary Rashid Al-Afasy" }, language: "ar" },
      { id: 2, recitation_name: "Abdul Rahman as-Sudais", translated_name: { name: "Abdul Rahman as-Sudais" }, language: "ar" },
    ],
  };
  const reciters = parseReciters(raw);
  assert.equal(reciters.length, 2);
  assert.equal(reciters[0].id, "1");
  assert.equal(reciters[1].id, "2");
});

check("parseReciters maps known reciter IDs correctly", () => {
  const raw = {
    recitations: [{ id: 7, language: "ar" }],
  };
  const reciters = parseReciters(raw);
  assert.equal(reciters.length, 1);
  assert.equal(reciters[0].name, "مشاري راشد العفاسي");
  assert.equal(reciters[0].englishName, "Mishari Rashid al-Afasy");
  assert.equal(reciters[0].style, "normal");
});

check("parseReciters handles malformed entries", () => {
  const raw = {
    recitations: [
      { id: 7, language: "ar" },
      { id: 999, language: "ar" },
      { recitation_name: "No ID", language: "ar" },
      null,
      "invalid",
    ],
  };
  const reciters = parseReciters(raw);
  assert.equal(reciters.length, 1);
  assert.equal(reciters[0].id, "7");
});

check("parseReciters handles missing data array", () => {
  assert.deepEqual(parseReciters({}), []);
  assert.deepEqual(parseReciters({ recitations: null }), []);
  assert.deepEqual(parseReciters(null), []);
  assert.deepEqual(parseReciters(undefined), []);
});

// ---- D. Surah data from provider (static) ----
check("provider getSurahs returns all 114 surahs", async () => {
  const surahs = await quranComProvider.getSurahs();
  assert.equal(surahs.length, 114);
});

check("provider surah data matches known values", async () => {
  const surahs = await quranComProvider.getSurahs();
  assert.equal(surahs[0].number, 1);
  assert.equal(surahs[0].name, "الفاتحة");
  assert.equal(surahs[0].englishName, "Al-Fatihah");
  assert.equal(surahs[0].ayahCount, 7);
  assert.equal(surahs[113].number, 114);
  assert.equal(surahs[113].name, "الناس");
  assert.equal(surahs[113].ayahCount, 6);
});

// ---- E. CDN URL resolution ----
check("resolveAudioUrl resolves relative paths against audio.qurancdn.com", () => {
  const result = resolveAudioUrl("Alafasy/mp3/001001.mp3");
  assert.equal(result, "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3");
});

check("resolveAudioUrl handles protocol-relative URLs", () => {
  const result = resolveAudioUrl("//mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3");
  assert.equal(result, "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3");
});

check("resolveAudioUrl returns absolute HTTPS URLs unchanged", () => {
  const result = resolveAudioUrl("https://example.com/audio/001001.mp3");
  assert.equal(result, "https://example.com/audio/001001.mp3");
});

check("resolveAudioUrl returns absolute HTTP URLs unchanged", () => {
  const result = resolveAudioUrl("http://example.com/audio/001001.mp3");
  assert.equal(result, "http://example.com/audio/001001.mp3");
});

check("resolveAudioUrl throws on empty or invalid input", () => {
  assert.throws(() => resolveAudioUrl(""), /Invalid audio URL/);
  assert.throws(() => resolveAudioUrl("  "), /Invalid audio URL/);
  assert.throws(() => resolveAudioUrl(null), /Invalid audio URL/);
});

// ---- F. Verse prefix derivation ----
check("deriveVersePrefix extracts prefix from Alafasy URL", () => {
  const prefix = deriveVersePrefix("Alafasy/mp3/001001.mp3");
  assert.equal(prefix, "Alafasy/mp3/");
});

check("deriveVersePrefix extracts prefix from Minshawi Mujawwad URL", () => {
  const prefix = deriveVersePrefix("Minshawi/Mujawwad/mp3/001001.mp3");
  assert.equal(prefix, "Minshawi/Mujawwad/mp3/");
});

check("deriveVersePrefix extracts prefix from protocol-relative URL", () => {
  const prefix = deriveVersePrefix("//mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3");
  assert.equal(prefix, "//mirrors.quranicaudio.com/everyayah/Husary_64kbps/");
});

check("deriveVersePrefix returns null for non-matching URLs", () => {
  assert.equal(deriveVersePrefix("not-a-url"), null);
  assert.equal(deriveVersePrefix("001001.mp3"), null);
  assert.equal(deriveVersePrefix("Alafasy/mp3/001.mp3"), null);
  assert.equal(deriveVersePrefix(""), null);
});

// ---- G. Verse URL construction ----
check("buildVerseUrl constructs correct URL from Alafasy prefix", () => {
  const prefix = deriveVersePrefix("Alafasy/mp3/001001.mp3");
  assert.ok(prefix);
  const url = buildVerseUrl(prefix, 2, 255);
  assert.equal(url, "https://audio.qurancdn.com/Alafasy/mp3/002255.mp3");
});

check("buildVerseUrl constructs correct URL from Minshawi prefix", () => {
  const prefix = deriveVersePrefix("Minshawi/Mujawwad/mp3/001001.mp3");
  assert.ok(prefix);
  const url = buildVerseUrl(prefix, 1, 7);
  assert.equal(url, "https://audio.qurancdn.com/Minshawi/Mujawwad/mp3/001007.mp3");
});

check("buildVerseUrl resolves protocol-relative URLs correctly", () => {
  const prefix = deriveVersePrefix("//mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3");
  assert.ok(prefix);
  const url = buildVerseUrl(prefix, 2, 1);
  assert.equal(url, "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/002001.mp3");
});

check("buildVerseUrl pads surah and verse numbers to 3 digits", () => {
  const prefix = "Alafasy/mp3/";
  const url = buildVerseUrl(prefix, 1, 1);
  assert.equal(url, "https://audio.qurancdn.com/Alafasy/mp3/001001.mp3");
});

// ---- H. Provider class structure ----
check("QuranComProvider implements AudioProviderOps interface", () => {
  assert.equal(typeof quranComProvider.getReciters, "function");
  assert.equal(typeof quranComProvider.getSurahs, "function");
  assert.equal(typeof quranComProvider.getSurahAudio, "function");
  assert.equal(typeof quranComProvider.getSurahAudioQueue, "function");
});

// ---- I. Storage ----
const { loadAudioSettings, saveAudioSettings, DEFAULTS } = await import(
  pathToFileURL(outFile("storage.js")).href
);

check("DEFAULTS has correct default values", () => {
  assert.equal(DEFAULTS.selectedReciter, "");
  assert.equal(DEFAULTS.lastPlayedSurah, 0);
  assert.equal(DEFAULTS.lastPosition, 0);
  assert.equal(DEFAULTS.volume, 0.5);
});

check("saveAudioSettings then loadAudioSettings round-trips", () => {
  const testSettings = { selectedReciter: "7", lastPlayedSurah: 2, lastPosition: 42.5, volume: 0.5 };
  saveAudioSettings(testSettings);
  const loaded = loadAudioSettings();
  assert.equal(loaded.selectedReciter, "7");
  assert.equal(loaded.lastPlayedSurah, 2);
  assert.equal(loaded.lastPosition, 42.5);
  assert.equal(loaded.volume, 0.5);
});

check("loadAudioSettings handles malformed localStorage", () => {
  localStorage.setItem("wardi:audio:settings-v1", "not-valid-json");
  const settings = loadAudioSettings();
  assert.deepEqual(settings, DEFAULTS);
  localStorage.removeItem("wardi:audio:settings-v1");
});

check("loadAudioSettings returns defaults when nothing stored", () => {
  localStorage.removeItem("wardi:audio:settings-v1");
  const settings = loadAudioSettings();
  assert.deepEqual(settings, DEFAULTS);
});

// ---- runner ----
for (const { name, fn } of checks) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
console.log(`\n${passed}/${checks.length} checks passed`);
