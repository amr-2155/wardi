/* ====================================================================
 * Adhkar dataset + completion feedback -- focused coverage
 * ====================================================================
 * Two defects prompted this harness, both reported by hand from the
 * running app rather than found by an existing suite:
 *
 *   1. Duplicate dhikr. AdhkarMorning listed "أستغفر الله وأتوب إليه ×100"
 *      twice (day-astaghfiru-100 and day-istighfar-100), "رضيت بالله" three
 *      times, and four more pairs beside them. Nothing could have caught
 *      this: the dataset is static data with no invariant attached to it, so
 *      every suite stayed green while the user was asked to recite the same
 *      dhikr again and again. The copies are gone; this file is what stops
 *      them coming back, and it checks what the USER sees (every category
 *      view, including the shared morning/evening dhikr) rather than the
 *      authored `category` field.
 *
 *   2. Feedback on every tap. Counting to 100 fired the vibrator 100 times
 *      and played 100 clicks. The contract now is one pulse and one chime on
 *      the LAST repetition, and there are two counting surfaces (the recite
 *      screen and the card list), so both are pinned. Running a React
 *      component would need a renderer; instead the call sites are read as
 *      source and required to carry the final-repetition guard, the same way
 *      the other static harnesses in this repo verify wiring.
 *
 * What is executed for real: the compiled data module. What is asserted
 * statically: the two component call sites, and the locale keys they render.
 * ==================================================================== */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "node_modules", ".cache", "adhkar-test");

const read = (rel) => readFileSync(join(ROOT, ...rel.split("/")), "utf8");

const DATA = read("src/data/adhkar.ts");
const RECITER = read("src/components/views/adhkar/DhikrReciter.tsx");
const VIEW = read("src/components/views/adhkar/AdhkarView.tsx");
const HAPTICS = read("src/lib/haptics.ts");
const TICK = read("src/lib/tick.ts");
const LOCALE = read("src/lib/locale.ts");

/* ------------------------------------------------------------------ */
/* Compile the real dataset so the assertions run on shipped data.     */
/* ------------------------------------------------------------------ */

rmSync(OUT, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    join(ROOT, "src", "data", "adhkar.ts"),
    join(ROOT, "src", "lib", "arabicSearch.ts"),
    "--outDir", OUT,
    "--module", "commonjs", "--moduleResolution", "node",
    "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const adhkar = await import(pathToFileURL(join(OUT, "data", "adhkar.js")).href);
const arabicSearch = await import(pathToFileURL(join(OUT, "lib", "arabicSearch.js")).href);

/* ------------------------------------------------------------------ */
/* Arabic-aware duplicate keys                                          */
/* ------------------------------------------------------------------ */

/** Diacritics, tatweel and Quranic marks carry no identity. */
const bare = (t) =>
  t
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The looser key, which also erases how the salutation was written.
 *
 * Two copies of one dhikr differed ONLY there: "صَلَّى اللهُ عليه وسلّم"
 * versus the single ﷺ glyph. Counting those as distinct is exactly the bug
 * this harness exists for, so they collapse to the same key — and the
 * written-out form is removed as a unit so no two different dhikr can be
 * merged by accident.
 */
const loose = (t) => bare(t).replace(/\uFDFA/g, "").replace(/صلىاللهعليهوسلم/g, "");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(`${name}: ${err.message}`);
    console.log(`FAIL ${name}`);
    console.log(`     ${err.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* A. No dhikr appears twice in a list the user can open                */
/* ------------------------------------------------------------------ */

check("A1: the module really loaded the dataset and the categories", () => {
  assert.ok(adhkar.DHIKR_ITEMS.length > 40, `dataset looks truncated: ${adhkar.DHIKR_ITEMS.length}`);
  assert.ok(adhkar.DHIKR_CATEGORIES.length >= 10, "categories look truncated");
});

for (const category of adhkar.DHIKR_CATEGORIES) {
  check(`A2: ${category.id} shows no dhikr twice`, () => {
    const items = adhkar.getCategoryDhikr(category.id);
    assert.ok(items.length > 0, `${category.id} resolved to an empty list`);
    for (const [name, key] of [["exact", bare], ["near", loose]]) {
      const seen = new Map();
      for (const item of items) {
        const k = key(item.text);
        assert.ok(
          k.length > 0,
          `${category.id}/${item.id} has text that normalizes to nothing — the check would be blind`
        );
        assert.equal(
          seen.get(k),
          undefined,
          `${name} duplicate in ${category.id}: ${item.id} repeats ${seen.get(k) ?? ""}`
        );
        seen.set(k, item.id);
      }
    }
  });
}

check("A3: ids are unique across the whole dataset", () => {
  const seen = new Set();
  for (const item of adhkar.DHIKR_ITEMS) {
    assert.ok(!seen.has(item.id), `repeated id: ${item.id}`);
    seen.add(item.id);
  }
});

/* The specific pairs the user reported. A general rule can be satisfied by
   deleting the wrong copy; these pin the survivors. */
const morning = adhkar.getCategoryDhikr("morning");
const evening = adhkar.getCategoryDhikr("evening");

const countMatching = (list, text) => list.filter((i) => bare(i.text) === bare(text)).length;

const ISTIGHFAR = "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ.";
const RADITU = "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا";
const SALAH = "اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ";

check("A4: the reported ×100 istighfar is listed once in each of morning and evening", () => {
  assert.equal(countMatching(morning, ISTIGHFAR), 1, `morning has ${countMatching(morning, ISTIGHFAR)}`);
  assert.equal(countMatching(evening, ISTIGHFAR), 1, `evening has ${countMatching(evening, ISTIGHFAR)}`);
});

check("A5: the ×100 istighfar kept its count of 100", () => {
  const item = morning.find((i) => bare(i.text) === bare(ISTIGHFAR));
  assert.equal(item.count, 100, `expected count 100, got ${item.count}`);
  assert.equal(item.authenticity, "muttafaq", "the stronger of the two gradings must survive");
});

check("A6: raditu and salli survive exactly once, at the stronger grading", () => {
  const raditu = morning.find((i) => bare(i.text).startsWith(bare(RADITU)));
  assert.ok(raditu, "the رضيت بالله dhikr is gone from the morning list");
  assert.equal(raditu.count, 3, `expected count 3, got ${raditu.count}`);
  assert.equal(raditu.authenticity, "sahih");

  const salah = morning.find((i) => loose(i.text).startsWith(loose(SALAH)));
  assert.ok(salah, "the salli 'ala Muhammad dhikr is gone");
  assert.equal(salah.count, 10, `expected count 10, got ${salah.count}`);
});

check("A7: no dhikr lost its times filter (the shared set still reaches evening)", () => {
  const eveningOnly = morning.filter((i) => i.times === "morning");
  assert.ok(
    !eveningOnly.some((i) => evening.some((e) => e.id === i.id)),
    "a morning-only dhikr is leaking into the evening list"
  );
  assert.ok(evening.length >= 15, `evening resolved to only ${evening.length} items`);
});

check("A8: the data module under test is the one on disk", () => {
  for (const [name, src] of [["data", DATA], ["reciter", RECITER], ["view", VIEW]]) {
    assert.ok(src.length > 500, `${name} source looks empty — the assertions below would be blind`);
  }
  assert.ok(DATA.includes("DHIKR_ITEMS"), "adhkar.ts does not contain the dataset");
});

/* ------------------------------------------------------------------ */
/* B. Completion & tap feedback — per-tap confirmation, final resolution */
/* ------------------------------------------------------------------ */

check("B1: per-tap feedback is available for every repetition", () => {
  assert.ok(/export function playDhikrTap\(/.test(TICK), "tick.ts exports playDhikrTap");
  assert.ok(/export function dhikrTap\(/.test(HAPTICS), "haptics.ts exports dhikrTap");
  assert.ok(/export function dhikrFinal\(/.test(HAPTICS), "the completion pulse is missing");
  assert.ok(
    /export function playDhikrComplete\(/.test(TICK),
    "the completion chime is missing"
  );
});

check("B2: per-tap feedback is used on every tap, final only on last rep", () => {
  for (const [name, src] of [
    ["DhikrReciter", RECITER],
    ["AdhkarView", VIEW],
  ]) {
    assert.ok(/\bplayDhikrTapFeedback\(/.test(src), `${name} uses per-tap feedback`);
  }
});

check("B3: the recite screen guards the feedback on the last repetition", () => {
  const call = RECITER.match(/if \(([^\n]*?)\)\s*playCompletionFeedback\(/);
  assert.ok(call, "the recite screen no longer calls playCompletionFeedback");
  assert.match(
    call[1],
    /remaining\s*<=\s*1/,
    `the feedback guard is "${call[1].trim()}" — it must fire only when nothing is left`
  );
});

check("B4: the card list guards its feedback on reaching the target", () => {
  const call = VIEW.match(/if \(([^\n]*?)\)\s*playCompletionFeedback\(/);
  assert.ok(call, "the card list no longer calls playCompletionFeedback");
  assert.match(
    call[1],
    /next\s*>=\s*target/,
    `the card guard is "${call[1].trim()}" — it must fire only on the final tap`
  );
  /* A tap on a completed card RESETS it; that must stay silent, or undoing a
     mis-tap would celebrate a repetition that never happened. */
  assert.match(VIEW, /if \(done\) \{\s*onSetCount\(item\.id, 0\);\s*return;/,
    "the reset path changed shape — re-check that resetting stays silent");
});

check("B5: the feedback module owns the contract for both surfaces", () => {
  const feedback = read("src/lib/dhikrFeedback.ts");
  assert.match(feedback, /export function playCompletionFeedback\(prefs: DhikrFeedback\)/,
    "dhikrFeedback.ts no longer exposes playCompletionFeedback");
  assert.match(feedback, /export function playDhikrTapFeedback\(prefs: DhikrFeedback\)/,
    "dhikrFeedback.ts no longer exposes per-tap helper");
  assert.match(feedback, /dhikrFinal\(\)/, "the helper does not fire the pulse");
  assert.match(feedback, /dhikrTap\(\)/, "the per-tap haptic helper");
  /* Both channels independent: a user who keeps the pulse and silences the
     chime must not lose the pulse. */
  const body = feedback.slice(feedback.indexOf("export function playCompletionFeedback"));
  assert.match(body, /if \(prefs\.haptic\) dhikrFinal\(\)/);
  assert.match(body, /if \(prefs\.sound\) playDhikrFinal\(\)/);

  /* Per-tap feedback for every repetition. */
  const tapBody = feedback.slice(feedback.indexOf("export function playDhikrTapFeedback"));
  assert.match(tapBody, /if \(prefs\.haptic\) dhikrTap\(\)/);
  assert.match(tapBody, /if \(prefs\.sound\) playDhikrTap\(\)/);
});

check("B6: the preference toggles and their labels are still reachable", () => {
  for (const key of [
    "adhkar.completeHaptic",
    "adhkar.completeHapticDesc",
    "adhkar.completeSound",
    "adhkar.completeSoundDesc",
    "adhkar.feedbackTitle",
    "adhkar.remaining",
    "adhkar.completedCount",
  ]) {
    assert.ok(VIEW.includes(`"${key}"`) || RECITER.includes(`"${key}"`),
      `${key} is defined but never rendered`);
    const ar = LOCALE.match(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"([^"]*)"`));
    const en = LOCALE.slice(LOCALE.indexOf("const EN"));
    const enMatch = en.match(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"([^"]*)"`));
    assert.ok(ar, `${key} is missing from the Arabic dictionary`);
    assert.ok(enMatch, `${key} is missing from the English dictionary`);
    assert.notEqual(ar[1], key, `${key} renders as its own key`);
  }
  /* The old tick wording is gone: it described behaviour the app no longer has. */
  assert.ok(!LOCALE.includes("adhkar.tickSound"), "the stale tickSound key is still defined");
  assert.ok(!LOCALE.includes("adhkar.tickHaptic"), "the stale tickHaptic key is still defined");
});

check("B7: no Arabic leaked into the two components while wiring them up", () => {
  const arabic = /[\u0600-\u06FF]/;
  for (const [name, src] of [
    ["DhikrReciter", RECITER],
    ["AdhkarView", VIEW],
  ]) {
    src.split("\n").forEach((line, i) => {
      if (!arabic.test(line)) return;
      /* Comments name the dhikr they are about; only code is checked. */
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      assert.fail(`${name}:${i + 1} hardcoded Arabic in code: ${line.trim()}`);
    });
  }
});

/* ------------------------------------------------------------------ */
/* C. Searching the list                                                */
/* ------------------------------------------------------------------ */

/* Found by hand too: the search compared raw strings, and the dataset is
   vocalized while a keyboard produces plain letters — so "أستغفر" matched
   nothing and the ×100 istighfar was unfindable by its own name. The rule now
   lives in its own module, so it is executed here rather than read. */
const { normalizeArabic, matchesAnyArabic } = arabicSearch;

check("C1: a query typed without diacritics finds the vocalized dhikr", () => {
  const vocalized = "أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ.";
  for (const typed of ["أستغفر", "استغفر", "  استغفر  ", "أستغفر الله"]) {
    assert.ok(
      matchesAnyArabic([vocalized, "رواه البخاري ومسلم", undefined], typed),
      `"${typed}" should match the vocalized istighfar`
    );
  }
  assert.ok(!matchesAnyArabic([vocalized], "سبحان"), "an unrelated word must not match");
});

check("C2: the reported ×100 istighfar is reachable by typing its own name", () => {
  const istighfar = adhkar.getCategoryDhikr("morning").find((i) => i.count === 100 && bare(i.text).includes(bare(ISTIGHFAR)));
  assert.ok(istighfar, "the ×100 istighfur is missing from the morning list");
  const hits = adhkar
    .getCategoryDhikr("morning")
    .filter((i) => matchesAnyArabic([i.text, i.source, i.note], "أستغفر"));
  assert.ok(hits.some((i) => i.id === istighfar.id), "typing it does not surface it");
});

check("C3: orthographic variants fold together, different words stay apart", () => {
  assert.equal(normalizeArabic("أَحْمَد"), normalizeArabic("احمد"));
  assert.equal(normalizeArabic("إِلَىٰ"), normalizeArabic("الي"));
  assert.equal(normalizeArabic("الصَّلَاةُ"), normalizeArabic("الصلاة"));
  assert.notEqual(normalizeArabic("الصباح"), normalizeArabic("المغرب"));
});

check("C4: an empty query matches everything (the unfiltered list)", () => {
  for (const q of ["", "   "]) {
    assert.ok(matchesAnyArabic(["أي نص", undefined], q), `empty query ${JSON.stringify(q)} must match`);
  }
});

check("C5: the list filter really uses the Arabic matcher", () => {
  assert.match(VIEW, /matchesAnyArabic\(\[item\.text, item\.source, item\.note\], query\)/,
    "the adhkar list is filtering again with a raw string comparison");
});

/* ---- voice: recitation + counting must work inside the Android shell ----
   Android System WebView implements neither SpeechSynthesis nor the Web
   Speech recognition API, so a web-only implementation silently disappears on
   the phone. These checks pin the native bridge that makes the features real
   there, while keeping the browser fallback. */

const NATIVE_BRIDGE = "src/lib/nativeDhikrVoice.ts";
const NATIVE_PLUGIN =
  "android/app/src/main/java/com/wardi/app/DhikrVoicePlugin.java";
const ACTIVITY = "android/app/src/main/java/com/wardi/app/MainActivity.java";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const TTS = read("src/lib/dhikrTts.ts");
const VOICE_HOOK = read("src/hooks/useVoiceDhikr.ts");

check("D1: the native bridge exists and only registers inside the app", () => {
  const bridge = read(NATIVE_BRIDGE);
  assert.match(bridge, /Capacitor\.isNativePlatform\(\)/, "bridge must be native-only");
  assert.match(bridge, /registerPlugin<DhikrVoiceNativePlugin>\("DhikrVoice"\)/,
    "bridge must address the DhikrVoice plugin");
  assert.match(bridge, /if \(!Capacitor\.isNativePlatform\(\)\) return null;/,
    "the web must get null, not a broken plugin");
});

check("D2: the plugin really drives Android TTS and SpeechRecognizer", () => {
  const plugin = read(NATIVE_PLUGIN);
  assert.match(plugin, /new TextToSpeech\(/, "recitation must use Android TTS");
  assert.match(plugin, /SpeechRecognizer\.createSpeechRecognizer/,
    "counting must use the Android recognizer");
  assert.match(plugin, /RecognizerIntent\.EXTRA_LANGUAGE, language/,
    "the recognizer must be told the language");
  assert.match(plugin, /"ar-SA"/, "Arabic is the default language");
  assert.match(plugin, /RECORD_AUDIO/, "the microphone permission must be declared");
  assert.match(plugin, /notifyListeners\("result"/, "recognized text must reach JS");
});

check("D3: the plugin and permission are wired into the app shell", () => {
  assert.match(read(ACTIVITY), /registerPlugin\(DhikrVoicePlugin\.class\)/,
    "MainActivity must register the plugin before Capacitor starts");
  assert.match(read(MANIFEST), /android\.permission\.RECORD_AUDIO/,
    "the manifest must request the microphone");
});

check("D4: both features prefer the native engine and keep the web fallback", () => {
  assert.match(TTS, /nativeDhikrVoice\(\)/, "TTS must check for the native engine first");
  assert.match(TTS, /speechSynthesis/, "the browser path must remain as a fallback");
  assert.match(VOICE_HOOK, /nativeDhikrVoice\(\)/, "the counter must check for the native engine first");
  assert.match(VOICE_HOOK, /webkitSpeechRecognition/, "the browser path must remain as a fallback");
});

check("D5: the counter still guards against double counting", () => {
  assert.match(VOICE_HOOK, /cooldownMs = 1200/, "a cooldown must exist");
  assert.match(VOICE_HOOK, /if \(now - lastCountRef\.current < cooldownMs\) return;/,
    "the cooldown must actually gate onCount");
  assert.match(VOICE_HOOK, /if \(!isFinal\) return;/, "partial results must never count");
});

/* ------------------------------------------------------------------ */

console.log(`\nAdhkar dataset and completion feedback: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}