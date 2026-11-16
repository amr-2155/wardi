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
import { existsSync, readFileSync, rmSync } from "node:fs";
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
    join(ROOT, "src", "lib", "mushafText.ts"),
    join(ROOT, "src", "lib", "swipeNav.ts"),
    join(ROOT, "src", "lib", "audio", "hisnmuslim.ts"),
    "--outDir", OUT,
    "--module", "commonjs", "--moduleResolution", "node",
    "--target", "es2019", "--esModuleInterop", "--skipLibCheck", "--types", "node",
  ],
  { cwd: ROOT, stdio: "pipe" }
);

const adhkar = await import(pathToFileURL(join(OUT, "data", "adhkar.js")).href);
const arabicSearch = await import(pathToFileURL(join(OUT, "lib", "arabicSearch.js")).href);
const mushafText = await import(pathToFileURL(join(OUT, "lib", "mushafText.js")).href);
const swipeNav = await import(pathToFileURL(join(OUT, "lib", "swipeNav.js")).href);
const hisnmuslim = await import(pathToFileURL(join(OUT, "lib", "audio", "hisnmuslim.js")).href);

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

check("B1: the per-tap tick exists; vibration is the completion's alone", () => {
  assert.ok(/export function playDhikrTap\(/.test(TICK), "tick.ts exports playDhikrTap");
  assert.ok(/export function dhikrFinal\(/.test(HAPTICS), "the completion pulse is missing");
  assert.ok(
    /export function playDhikrComplete\(/.test(TICK),
    "the completion chime is missing"
  );
  /* The user asked for vibration on the LAST repetition. A per-tap pulse would
     also fire 100 times on the ×100 adhkar, which is the rattle this file was
     written to stop. */
  assert.ok(!/export function dhikrTap\(/.test(HAPTICS), "no per-tap vibrator helper should come back");
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
  /* Both channels independent: a user who keeps the pulse and silences the
     chime must not lose the pulse. */
  const body = feedback.slice(feedback.indexOf("export function playCompletionFeedback"));
  assert.match(body, /if \(prefs\.haptic\) dhikrFinal\(\)/);
  assert.match(body, /if \(prefs\.sound\) playDhikrFinal\(\)/);

  /* Per-repetition feedback is the tick only. Resetting a count must never
     invent a repetition, and no tap below the last may buzz. */
  const tapBody = feedback.slice(feedback.indexOf("export function playDhikrTapFeedback"));
  assert.match(tapBody, /if \(prefs\.sound\) playDhikrTap\(\)/);
  assert.ok(!/dhikrTap\(|dhikrFinal\(|vibrate/.test(tapBody),
    "the intermediate repetitions must not vibrate");
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

/* ---- voice: the native bridge, now TTS only -------------------------------
   Android System WebView has no SpeechSynthesis, so the spoken fallback would
   silently disappear on the phone. These checks pin the remaining bridge, and
   pin the removal of the microphone feature: no recognizer, no permission, no
   dead hook left behind. */

const NATIVE_BRIDGE = "src/lib/nativeDhikrVoice.ts";
const NATIVE_PLUGIN =
  "android/app/src/main/java/com/wardi/app/DhikrVoicePlugin.java";
const ACTIVITY = "android/app/src/main/java/com/wardi/app/MainActivity.java";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const TTS = read("src/lib/dhikrTts.ts");
const VOICE_HOOK = "src/hooks/useVoiceDhikr.ts";

check("D1: the native bridge exists and only registers inside the app", () => {
  const bridge = read(NATIVE_BRIDGE);
  assert.match(bridge, /Capacitor\.isNativePlatform\(\)/, "bridge must be native-only");
  assert.match(bridge, /registerPlugin<DhikrVoiceNativePlugin>\("DhikrVoice"\)/,
    "bridge must address the DhikrVoice plugin");
  assert.match(bridge, /if \(!Capacitor\.isNativePlatform\(\)\) return null;/,
    "the web must get null, not a broken plugin");
});

check("D2: the plugin drives Android TTS and nothing else", () => {
  const plugin = read(NATIVE_PLUGIN);
  assert.match(plugin, /new TextToSpeech\(/, "spoken text must use Android TTS");
  assert.match(plugin, /"ar-SA"/, "Arabic is the default language");
  assert.match(plugin, /notifyListeners\("speakEnd"/, "the end of speech must reach JS");
  assert.ok(!/import android\.speech\.SpeechRecognizer|SpeechRecognizer\./.test(plugin),
    "the microphone half must be gone, not hidden");
});

check("D3: the plugin is wired into the app shell and the microphone is not", () => {
  assert.match(read(ACTIVITY), /registerPlugin\(DhikrVoicePlugin\.class\)/,
    "MainActivity must register the plugin before Capacitor starts");
  const manifest = read(MANIFEST);
  assert.ok(!manifest.includes("RECORD_AUDIO"), "the manifest still requests the microphone");
  assert.match(manifest, /android\.permission\.VIBRATE/, "the vibration permission must stay");
});

check("D4: spoken text prefers the native engine and keeps the web fallback", () => {
  assert.match(TTS, /nativeDhikrVoice\(\)/, "TTS must check for the native engine first");
  assert.match(TTS, /speechSynthesis/, "the browser path must remain as a fallback");
  assert.match(TTS, /export function speakText/, "the shared speak entry point must survive");
});

check("D5: the count-by-voice feature is fully removed, hook and all", () => {
  assert.ok(!existsSync(join(ROOT, ...VOICE_HOOK.split("/"))), "useVoiceDhikr.ts still exists");
  for (const [name, src] of [["reciter", RECITER], ["view", VIEW]]) {
    assert.ok(!/useVoiceDhikr|isVoiceRecognitionSupported|voiceCount/.test(src),
      `${name} still references the removed voice counter`);
  }
  assert.ok(!/startListening|stopListening/.test(read(NATIVE_BRIDGE)),
    "the bridge still exposes microphone methods");
});

/* ------------------------------------------------------------------ */
/* E. The 2026-10 request set                                           */
/* ------------------------------------------------------------------ */
/* Reported from the phone in one voice note, each item a separate promise:
   the Done button starts faded and lights up, every repetition ticks, the
   last repetition gets a DIFFERENT tick AND a vibration, pages can be walked
   back and forth, Quran reads like a mushaf with verse medallions, the last
   two verses of Al-Baqarah are in the evening list, and the short repeated
   adhkar sit back to back so they are easy to memorise. */

const MUSHAF_RENDERER = "src/components/views/adhkar/VersesMushaf.tsx";
const FEEDBACK = "src/lib/dhikrFeedback.ts";

check("E1: the VIBRATE permission is declared, or the pulse is silently dropped", () => {
  assert.match(read(MANIFEST), /android\.permission\.VIBRATE/,
    "navigator.vibrate does nothing without android.permission.VIBRATE in the WebView");
});

check("E2: the Done button starts faded and lights on press", () => {
  /* The lit branch must be conditional. A gold button that is always gold is
     exactly what the screenshot showed: no feedback, so no confidence the tap
     registered. */
  assert.match(RECITER, /pressed\s*\?\s*"border-gold bg-gold text-primary-deep/,
    "the lit style must be behind the `pressed` flag");
  assert.match(RECITER, /border-gold\/25 bg-gold-soft\/60 text-gold-strong\/75/,
    "the resting style must be the faded one");
  assert.match(RECITER, /setPressed\(true\)/, "a press must set the lit state");
  assert.match(RECITER, /window\.setTimeout\([\s\S]{0,120}setPressed\(false\)/,
    "the glow must fall back to faded on its own");
  assert.match(RECITER, /onPointerDown=\{lightUp\}/,
    "pointer-down must light it before the click resolves");
});

check("E3: every repetition ticks; the last one gets the distinct resolution", () => {
  assert.match(RECITER, /if \(remaining <= 1\) playCompletionFeedback\(prefs\);\s*\n\s*else playDhikrTapFeedback\(prefs\);/,
    "the recite screen must pick exactly one sound per repetition");
  assert.match(VIEW, /if \(next >= target\) playCompletionFeedback\(prefs\);\s*\n\s*else playDhikrTapFeedback\(prefs\);/,
    "the card list must pick exactly one sound per repetition");
  assert.match(TICK, /export function playDhikrTap\b/, "a distinct per-tap tick must exist");
  assert.match(TICK, /export function playDhikrFinal\b/, "a distinct final tone must exist");
  assert.match(TICK, /return ctx;/, "the first tap must not be swallowed while the context resumes");
});

check("E4: the final repetition vibrates (the channel that survives a look-away)", () => {
  assert.match(read(FEEDBACK), /dhikrFinal\(\)/, "completion must trigger the vibration pattern");
  assert.match(HAPTICS, /export function dhikrFinal\b/, "the final pulse must have one definition");
});

check("E5: a page can be walked backwards and forwards without counting", () => {
  assert.match(RECITER, /const go = useCallback\(\s*\n\s*\(delta: 1 \| -1\)/,
    "navigation must be a separate function from counting");
  assert.match(RECITER, /onClick=\{\(\) => go\(-1\)\}/, "there must be a working previous button");
  assert.match(RECITER, /onClick=\{\(\) => go\(1\)\}/, "there must be a working next button");
  assert.match(RECITER, /onTouchStart=\{onTouchStart\}/, "swipe must be wired");
  assert.match(RECITER, /animate-dhikr-leave-rev/, "going back must animate in the reverse direction");
});

check("E6: Quran passages render as a mushaf through one shared parser", () => {
  const renderer = read(MUSHAF_RENDERER);
  assert.match(renderer, /parseMushafParts/, "the renderer must use the shared, tested split");
  assert.match(renderer, /from "@\/lib\/mushafText"/, "the split must come from the pure module");
  assert.match(renderer, /rounded-full border border-gold\/60/, "verse numbers must be medallions, not a list");
  assert.match(VIEW, /<VersesMushaf text=\{item\.text\} size="sm" \/>/,
    "the card list must render Quran through the mushaf component");
  assert.match(RECITER, /<VersesMushaf text=\{item\.text\} \/>/,
    "the recite screen must render Quran through the mushaf component");
});

check("E7: the split really separates words from verse numbers", () => {
  const parts = mushafText.parseMushafParts("قل هو الله أحد (1) الله الصمد (2)");
  assert.deepEqual(
    parts.map((p) => (p.kind === "ayah" ? p.n : p.text)),
    ["قل هو الله أحد", 1, "الله الصمد", 2],
    `unexpected split: ${JSON.stringify(parts)}`
  );
  const single = mushafText.parseMushafParts("آية بلا رقم");
  assert.deepEqual(single, [{ kind: "words", text: "آية بلا رقم" }], "plain text must survive untouched");
  assert.deepEqual(mushafText.parseMushafParts("   "), [], "blank text must yield no parts");
  assert.ok(mushafText.hasAyahMarkers("(1)"), "hasAyahMarkers must see a marker");
  assert.ok(!mushafText.hasAyahMarkers("بلا رقم"), "hasAyahMarkers must not invent one");
});

check("E8: every marked Quran passage round-trips with its numbers intact", () => {
  const marked = adhkar.DHIKR_ITEMS.filter((i) => mushafText.hasAyahMarkers(i.text));
  assert.ok(marked.length >= 4, `expected several marked passages, found ${marked.length}`);
  for (const item of marked) {
    const parts = mushafText.parseMushafParts(item.text);
    const rebuilt = parts.map((p) => (p.kind === "words" ? p.text : `(${p.n})`)).join(" ");
    const numbers = parts.filter((p) => p.kind === "ayah").map((p) => p.n);
    const expected = (item.text.match(/\((\d+)\)/g) ?? []).map((m) => Number(m.slice(1, -1)));
    assert.deepEqual(numbers, expected, `${item.id} lost or reordered a verse number`);
    /* Compare the wording with spacing, diacritics and punctuation removed:
       the renderer is allowed to re-flow whitespace, never to drop a word. */
    assert.equal(bare(rebuilt), bare(item.text), `${item.id} lost wording around a marker`);
  }
});

check("E9: the evening list carries Al-Baqarah 285-286", () => {
  const item = adhkar.getCategoryDhikr("evening").find((i) => i.id === "evening-aman-arrasul");
  assert.ok(item, "the evening list must contain the last two verses of Al-Baqarah");
  assert.equal(item.type, "quran", "it is Quran, not a hadith");
  assert.ok(bare(item.text).includes(bare("آمن الرسول")), "it must open with آمن الرسول");
  const numbers = mushafText
    .parseMushafParts(item.text)
    .filter((p) => p.kind === "ayah")
    .map((p) => p.n);
  assert.deepEqual(numbers, [285, 286], `verse numbers must be 285 and 286, got ${numbers}`);
  assert.ok(!adhkar.getCategoryDhikr("morning").some((i) => i.id === item.id),
    "it is a night dhikr and must stay out of the morning list");
});

check("E10: the short repeated adhkar sit back to back for memorisation", () => {
  for (const category of ["morning", "evening"]) {
    const ids = adhkar.getCategoryDhikr(category).map((i) => i.id);
    const at = (id) => ids.indexOf(id);
    assert.ok(at("day-subhanallah100") >= 0, `${category}: missing the ×100 tasbih`);
    assert.equal(at("day-lailaha-x10"), at("day-subhanallah100") + 1,
      `${category}: the tahlil must follow the tasbih`);
    assert.equal(at("day-astaghfiru-100"), at("day-lailaha-x10") + 1,
      `${category}: the istighfar must follow the tahlil`);
    assert.equal(at("day-awdhu-kalimat"), at("day-astaghfiru-100") + 1,
      `${category}: the refuge dhikr must follow the istighfar`);
    assert.equal(at("day-hasbiyallah"), at("day-awdhu-kalimat") + 1,
      `${category}: حسبي الله must follow it`);
    assert.equal(at("day-dua-yunus"), at("day-hasbiyallah") + 1,
      `${category}: the dua of Yunus must come right after حسبي الله`);
  }
  const counts = Object.fromEntries(adhkar.DHIKR_ITEMS.map((i) => [i.id, i.count]));
  assert.equal(counts["day-subhanallah100"], 100, "the tasbih is 100, not a rounded-down 3");
  assert.equal(counts["day-lailaha-x10"], 10, "the tahlil keeps its own count");
  assert.equal(counts["day-astaghfiru-100"], 100, "the istighfar is 100");
  assert.equal(counts["day-awdhu-kalimat"], 3, "the refuge dhikr is repeated three times");
});

check("E11: the dua of Yunus reads as one marked verse", () => {
  const item = adhkar.DHIKR_ITEMS.find((i) => i.id === "day-dua-yunus");
  assert.ok(item, "the dua of Yunus must exist");
  assert.ok(bare(item.text).includes(bare("لا إله إلا أنت سبحانك إني كنت من الظالمين")),
    "the wording must be the Quranic dua");
  assert.equal(item.type, "quran", "it is Quran 21:87");
  assert.equal(item.count, 3, "it is repeated three times");
  const numbers = mushafText
    .parseMushafParts(item.text)
    .filter((p) => p.kind === "ayah")
    .map((p) => p.n);
  assert.deepEqual(numbers, [87], "the medallion must read 87");
});

/* ------------------------------------------------------------------ */
/* F. The 2026-11 request set: listening, swipe, removals               */
/* ------------------------------------------------------------------ */
/* The screen now has to play a real reciter for the Quran cards, say nothing
   false about the hadith ones, remove the stars / voice counter / TTS voice
   list, and let a horizontal swipe turn pages without eating a tap. Each
   promise below is pinned to executable logic or to source it must contain. */

const AUDIO_LIB = read("src/lib/adhkarAudio.ts");
const AUDIO_UI = read("src/components/views/adhkar/DhikrAudio.tsx");
const SWIPE_LIB = read("src/lib/swipeNav.ts");
const QURAN_COM = read("src/lib/audio/quran-com.ts");
const HISN_LIB = read("src/lib/audio/hisnmuslim.ts");

/** The verses each Quran card actually quotes, in reading order. */
const EXPECTED_AUDIO = {
  "day-ayatal-kursi": [[2, 255]],
  "day-ikhlas": [[112, 1], [112, 2], [112, 3], [112, 4]],
  "day-falaq": [[113, 1], [113, 2], [113, 3], [113, 4], [113, 5]],
  "day-nas": [[114, 1], [114, 2], [114, 3], [114, 4], [114, 5], [114, 6]],
  "day-hasbiyallah": [[9, 129]],
  "day-dua-yunus": [[21, 87]],
  "evening-aman-arrasul": [[2, 285], [2, 286]],
  "sleep-ayatal-kursi": [[2, 255]],
  "sleep-ikhlas": [[112, 1], [112, 2], [112, 3], [112, 4]],
  "sleep-falaq": [[113, 1], [113, 2], [113, 3], [113, 4], [113, 5]],
  "sleep-nas": [[114, 1], [114, 2], [114, 3], [114, 4], [114, 5], [114, 6]],
  "prayer-ayatal-kursi": [[2, 255]],
  "general-hasbunallah": [[3, 173]],
};

check("F1: every Quran card names the exact verses it quotes, and no other card does", () => {
  const quran = adhkar.DHIKR_ITEMS.filter((i) => i.type === "quran");
  assert.equal(quran.length, Object.keys(EXPECTED_AUDIO).length,
    `the expected map covers ${Object.keys(EXPECTED_AUDIO).length} Quran cards, the dataset has ${quran.length}`);
  for (const item of quran) {
    const expected = EXPECTED_AUDIO[item.id];
    assert.ok(expected, `${item.id} is a Quran card with no expected audio reference`);
    const actual = (item.audio ?? []).map((r) => [r.surah, r.ayah]);
    assert.deepEqual(actual, expected, `${item.id} points at the wrong verses`);
  }
  for (const item of adhkar.DHIKR_ITEMS.filter((i) => i.type === "hadith")) {
    assert.equal(item.audio, undefined,
      `${item.id} is a hadith: claiming a verse reference would attach Quran reciter audio to words he did not say`);
  }
  /* And every audio card must be Quran — while a Hisn recording id must be the
     hadith's: the two sources never mix. */
  for (const item of adhkar.DHIKR_ITEMS) {
    if (item.audio) assert.equal(item.type, "quran", `${item.id} is not Quran but carries audio refs`);
    if (item.hisnId !== undefined) {
      assert.equal(item.type, "hadith", `${item.id} is not a hadith but carries a Hisn recording id`);
    }
  }
});

check("F2: the recording is looked up per ayah, from the Quran.com provider", () => {
  assert.match(AUDIO_LIB, /quranComProvider\.getSurahAudioQueue\(reciterId, surah\)/,
    "the player must ask the real provider for the reciter/surah queue");
  assert.match(AUDIO_LIB, /candidate\.ayah === ref\.ayah/,
    "the player must pick the track of the exact ayah");
  assert.ok(!/quran\.mp3|\.mp3["']/.test(AUDIO_LIB), "a generic or hardcoded file would not match the card");
  assert.match(AUDIO_LIB, /queueIndex \+= 1/, "verses must play in order");
  assert.match(QURAN_COM, /audio\.qurancdn\.com/, "the verified CDN must be the source");
});

check("F3: only reciters that exist in the provider table can be offered", () => {
  const ids = [...QURAN_COM.matchAll(/\n\s{2}(\d+): \{ name: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10, `reciter table looks truncated: ${ids.length}`);
  const offered = AUDIO_LIB.match(/ADHKAR_RECITER_IDS = \[([^\]]+)\]/);
  assert.ok(offered, "the offered reciter list is missing");
  const offeredIds = [...offered[1].matchAll(/"(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(offeredIds, ["7", "3", "4", "9", "5"], "the verified five must be exactly these");
  for (const id of offeredIds) {
    assert.ok(ids.includes(id), `reciter ${id} is offered but missing from RECITER_MAP`);
  }
  assert.match(QURAN_COM, /export function getReciterInfo/, "names must come from the same table as the ids");
  assert.match(AUDIO_UI, /adhkarReciters\(locale\)/, "the picker must render those names");
});

check("F4: every recording is a real recitation — no synthesized voice anywhere in playback", () => {
  /* The user rejected the automatic reading outright. It must be gone, not
     merely hidden behind a flag: no TTS import, no "synthetic" state, no
     machine voice attributed to a sheikh. */
  assert.ok(!/dhikrTts|speakDhikr|isTtsSupported/.test(AUDIO_LIB),
    "the playback path must not synthesize speech");
  assert.ok(!/synthetic/i.test(AUDIO_LIB), "the synthetic fallback must be gone, not hidden");
  assert.ok(!LOCALE.includes("adhkar.audioSynthetic"), "the automatic-reading wording must be removed");
  /* The hadith cards play their own Hisn al-Muslim recording. */
  assert.match(AUDIO_LIB, /hisnAudioUrl\(/, "a hadith card must play its Hisn recording");
  assert.match(HISN_LIB, /hisnmuslim\.com\/audio\/ar\//, "the verified host must be the source");
  assert.match(HISN_LIB, /export function hisnAudioUrl/, "the URL must be a pure, testable builder");
  assert.equal(hisnmuslim.hisnAudioUrl(79), "https://www.hisnmuslim.com/audio/ar/79.mp3",
    "the builder must produce the exact file a card requests");
  /* A card with no verified recording offers no control at all. */
  assert.match(AUDIO_UI, /if \(!canPlayDhikr\(item\)\) return null;/,
    "no verified recording must mean no control — not a dead button and not a machine voice");
  assert.match(AUDIO_LIB, /export function canPlayDhikr/, "the playability rule must be one exported function");
  assert.match(AUDIO_UI, /adhkar\.audioCreditHisn/, "the Hisn credit must be rendered beside a Hisn recording");
});

check("F5: swipe decides next/prev exactly, and never mistakes a tap or a scroll", () => {
  const { resolveSwipeNav } = swipeNav;
  assert.match(SWIPE_LIB, /export function resolveSwipeNav/, "the decision must be a pure, exported function");
  const at = (dx, dy = 4, startX = 200) =>
    resolveSwipeNav({ dx, dy, startX, viewportWidth: 400 });

  assert.equal(at(-120), "next", "swiping left must go to the next page");
  assert.equal(at(120), "prev", "swiping right must go to the previous page");
  assert.equal(at(-47), null, "a short drag is not a swipe");
  assert.equal(at(47), null, "a short drag is not a swipe");
  assert.equal(at(-48), "next", "the threshold itself is a deliberate swipe");
  assert.equal(at(-80, 200), null, "a vertical scroll must never turn the page");
  assert.equal(at(0), null, "a tap has no horizontal travel");
  assert.equal(at(-160, 4, 3), null, "Android's back-gesture edge must be left alone");
  assert.equal(at(160, 4, 397), null, "the system edge must be left alone on both sides");
  assert.equal(at(-48, 40), null, "1.2× horizontal dominance is not enough");
  assert.equal(at(-160, 200), null, "vertical intent still wins");
  assert.equal(at(-160, 4, 200), "next", "a clean horizontal drag away from the edges turns the page");
  assert.equal(at(NaN), null, "an invalid gesture must not navigate");
  assert.equal(at(-160, Number.NaN), null, "an invalid gesture must not navigate");
});

check("F6: the card is wired to that logic, with scroll and taps left intact", () => {
  assert.match(RECITER, /resolveSwipeNav\(/, "the touch handler must use the tested decision");
  assert.match(RECITER, /touchAction: "pan-y"/, "vertical scrolling must stay native");
  assert.match(RECITER, /onTouchCancel=\{onTouchCancel\}/, "a cancelled gesture must clear the start point");
  assert.match(RECITER, /e\.touches\.length !== 1/, "a second finger must not turn the first one's drag into a page turn");
  assert.match(RECITER, /const go = useCallback\(\s*\n\s*\(delta: 1 \| -1\)/,
    "buttons and swipe must share one navigation function");
  assert.match(RECITER, /onClick=\{\(\) => go\(-1\)\}/, "the previous button must use it");
  assert.match(RECITER, /onClick=\{\(\) => go\(1\)\}/, "the next button must use it");
  assert.match(RECITER, /if \(next < 0 \|\| next >= items\.length\) return;/,
    "navigation must stop at both ends");
  assert.match(RECITER, /disabled=\{index === 0\}/, "the first page must not go back");
  assert.match(RECITER, /disabled=\{isLast\}/, "the last page must not go past the end");
  assert.match(RECITER, /onClick=\{\(\) => toggleDhikrAudio\(item\)\}|<DhikrAudio item=\{item\} \/>/,
    "audio controls must be real buttons the swipe handler leaves alone");
});

check("F7: the removed elements are gone from both screens", () => {
  for (const [name, src] of [["reciter", RECITER], ["view", VIEW]]) {
    assert.ok(!src.includes("✦"), `${name} still renders a gold star/diamond`);
  }
  assert.ok(!RECITER.includes("animate-float-up"), "the stuck sparkle burst is still wired");
  assert.ok(!RECITER.includes("voiceChooseVoice"), "the system voice picker is still rendered");
  assert.ok(!VIEW.includes("isTtsSupported"), "the card list still shows a TTS control");
  assert.ok(!/\(v\.lang\)/.test(RECITER), "technical voice names are still printed");
  for (const key of ["adhkar.voiceChooseVoice", "adhkar.voiceCount", "adhkar.voiceListening"]) {
    assert.ok(!LOCALE.includes(key), `${key} is still shipped after the feature was removed`);
  }
});

check("F8: only one recording can play, and it stops when the page changes", () => {
  assert.match(AUDIO_LIB, /let audio: HTMLAudioElement \| null = null/,
    "one shared element is what makes overlap impossible");
  assert.match(AUDIO_LIB, /function silenceElement\(\)[\s\S]{0,220}audio\.pause\(\)/,
    "starting another dhikr must pause the previous one");
  const start = AUDIO_LIB.slice(AUDIO_LIB.indexOf("async function start"));
  assert.match(start, /silenceElement\(\)/, "every new dhikr must stop the previous audio");
  assert.match(RECITER, /const go = useCallback\([\s\S]{0,400}stopAdhkarAudio\(\)/,
    "a page turn must stop the current recording");
  assert.match(RECITER, /stopAdhkarAudio\(\);\s*\n\s*\},\s*\n\s*\[\]\s*\n\s*\);/,
    "leaving the recite screen must stop the audio");
  assert.match(VIEW, /useEffect\(\(\) => \(\) => stopAdhkarAudio\(\), \[\]\)/,
    "leaving the adhkar list must stop a card's recording");
  assert.match(VIEW, /stopAdhkarAudio\(\);[\s\S]{0,80}setReciting\(true\)/,
    "entering the recite screen must stop a card's recording first");
  assert.match(AUDIO_LIB, /publish\(\{ status: "paused" \}\)/, "pause must be a real state");
  assert.match(AUDIO_LIB, /if \(!isOnline\(\)\)[\s\S]{0,120}error: "offline"/,
    "offline must be detected before blaming the file");
  assert.match(AUDIO_UI, /adhkar\.audioOffline/, "the Arabic offline message must be reachable");
});

check("F9: the reciter choice is remembered across launches", () => {
  assert.match(AUDIO_LIB, /ward:v2:adhkar-reciter:v1/, "the choice needs a stable storage key");
  assert.match(AUDIO_LIB, /export function loadAdhkarReciter/, "the choice must be loaded");
  assert.match(AUDIO_LIB, /export function saveAdhkarReciter/, "the choice must be stored");
  assert.match(AUDIO_UI, /saveAdhkarReciter\(event\.target\.value\)/, "the picker must persist the choice");
  assert.match(AUDIO_LIB, /ADHKAR_RECITER_IDS as readonly string\[\]\)\.includes\(raw\)/,
    "a corrupt or removed id must fall back instead of breaking playback");
});

/* The three cards that are an excerpt of the verse they play. Verified against
   the Quran.com uthmani text: every other Quran card matches its verse(s) word
   for word, these three are a suffix (9:129), or a closing part (21:87, 3:173).
   Their recording is the whole verse, so the screen has to say so. */
const EXCERPT_CARDS = ["day-hasbiyallah", "day-dua-yunus", "general-hasbunallah"];

check("F10: a recording that says more or other than the card says so, and only those do", () => {
  for (const item of adhkar.DHIKR_ITEMS) {
    if (item.type === "quran") {
      const flagged = EXCERPT_CARDS.includes(item.id);
      if (flagged) {
        assert.ok(item.audioNote, `${item.id} plays a whole verse but shows an excerpt with no note`);
        assert.match(item.audioNote, /كاملة/, `${item.id} must say the recording reads the verse in full`);
        assert.ok(!/[A-Za-z]/.test(item.audioNote), `${item.id} note must be Arabic, like every other note in the dataset`);
        assert.ok(item.audio && item.audio.length > 0, `${item.id} must still point at the verse it plays`);
      } else {
        assert.equal(item.audioNote, undefined,
          `${item.id} is not an excerpt, so a note about the recording would be false`);
      }
      continue;
    }
    /* Hadith: a note is allowed only when there really is a recording, and it
       must be Arabic like every other note in the dataset. */
    if (item.audioNote !== undefined) {
      assert.ok(typeof item.hisnId === "number",
        `${item.id} carries a recording note but no Hisn recording id`);
      assert.ok(!/[A-Za-z]/.test(item.audioNote), `${item.id} note must be Arabic`);
      assert.ok(item.audioNote.length > 5, `${item.id} note is too short to explain anything`);
    }
  }
  /* The note is worthless if no screen renders it: it must be on the recite
     panel AND on the card, because playback can start from either. */
  assert.match(AUDIO_UI, /item\.audioNote/, "the recite panel must render the note");
  assert.match(VIEW, /item\.audioNote/, "the card must render the note beside its play button");
});

/* The two hadith cards whose wording has no recording in Hisn al-Muslim: the
   phrase is absent, so they stay silent and are reported rather than given an
   unrelated file or a machine voice. */
const HISN_UNAVAILABLE = ["day-huda-tuqa-afaf", "general-istighfar100"];

check("F11: every hadith card either plays a verified recording or is explicitly unavailable", () => {
  const hadith = adhkar.DHIKR_ITEMS.filter((i) => i.type === "hadith");
  const missing = hadith.filter((i) => typeof i.hisnId !== "number").map((i) => i.id).sort();
  assert.deepEqual(missing, [...HISN_UNAVAILABLE].sort(),
    `the set of unrecorded hadith cards changed: ${missing.join(", ") || "none"}`);
  let recorded = 0;
  for (const item of hadith) {
    if (typeof item.hisnId !== "number") {
      assert.equal(item.audioNote, undefined, `${item.id} has no recording, so it must carry no recording note`);
      continue;
    }
    recorded += 1;
    assert.ok(Number.isInteger(item.hisnId) && item.hisnId > 0 && item.hisnId < 300,
      `${item.id} has an implausible Hisn id: ${item.hisnId}`);
    assert.equal(hisnmuslim.hisnAudioUrl(item.hisnId),
      `https://www.hisnmuslim.com/audio/ar/${item.hisnId}.mp3`,
      `${item.id} builds the wrong recording URL`);
  }
  assert.equal(recorded, hadith.length - HISN_UNAVAILABLE.length,
    "a recorded hadith card was lost");
});

/* ------------------------------------------------------------------ */

console.log(`\nAdhkar dataset and completion feedback: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(`\n${failures.length} failure(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}