#!/usr/bin/env node
/**
 * Ayah actions menu contract.
 *
 * Tapping a verse in the text-based chapter reader opens AyahActionsSheet, a
 * bottom sheet whose every action reuses an existing engine. Static analysis
 * by design, like the rest of this suite: the point is to catch a regression
 * in the source, not to re-implement the menu.
 *
 * Honesty rules enforced here, because a menu is where fake actions breed:
 * - the verse shown must resolve through quran.getAyah (no invented ref)
 * - translation has NO dataset backing, so no translation row may exist
 * - similar ayahs render only from verified relations (getRelated)
 * - tafsir prefers reviewed entries, then the pinned published edition, with
 *   an honest empty state and a lazy load gated on an actual ayah tap
 * - MushafReader exposes no ayah tap surface (image pages carry no ayah
 *   coordinates); byte-identity is owned solely by test-w2.mjs C6
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${name}\n      ${err.message.split("\n")[0]}`);
    failed += 1;
  }
}

const SHEET = "src/components/views/AyahActionsSheet.tsx";
const READER = "src/components/views/QuranReader.tsx";
const LOCALE = "src/lib/locale.ts";

/* ---- wiring: tap opens the sheet with the tapped verse ---- */

check("M1: the sheet component exists and is a client module", () => {
  assert.ok(existsSync(join(ROOT, SHEET)), `${SHEET} must exist`);
  assert.match(read(SHEET), /^"use client"/m, "must carry the use client directive");
});

check("M2: tapping a verse opens the sheet with that verse ref", () => {
  const src = read(READER);
  assert.match(src, /import \{ AyahActionsSheet \}/, "reader must import the sheet");
  assert.match(src, /setMenuRef\(verseRef\)/, "verse tap must arm the sheet with the verse ref");
  assert.match(
    src,
    /<AyahActionsSheet[\s\S]*?ayahRef=\{menuRef\}/,
    "the sheet must receive the armed ref"
  );
  assert.match(src, /onClose=\{\(\) => setMenuRef\(null\)\}/, "closing must disarm the ref");
});

check("M3: the verse shown resolves through the dataset, never invented", () => {
  const src = read(SHEET);
  assert.match(src, /quran\.getAyah\(ayahRef\)/, "must resolve via quran.getAyah");
  assert.match(src, /resolved\.chapter\.name/, "header must come from the resolved chapter");
  assert.match(src, /resolved\.verse\.number/, "header must come from the resolved verse");
  assert.match(src, /ayah\.notFound/, "an unresolvable ref must say so, not render garbage");
});

check("M2b: press-and-hold opens the menu, and the platform gesture cannot steal it", () => {
  const src = read(READER);
  assert.match(src, /LONG_PRESS_MS\s*=\s*\d{3,}/, "a real long-press threshold must exist");
  assert.match(src, /onPointerDown/, "a hold timer must start on pointer down");
  assert.match(src, /setTimeout\([\s\S]{0,200}?setMenuRef\(verseRef\)/, "the hold must open the menu");
  assert.match(src, /onPointerUp=\{clearHold\}/, "release must cancel a pending hold");
  assert.match(src, /onPointerCancel=\{clearHold\}/, "a cancelled press must not fire late");
  assert.match(src, /onContextMenu=\{\(e\) => e\.preventDefault\(\)\}/, "the platform text-selection menu must be suppressed");
  assert.match(src, /select-none/, "the verse must not be text-selectable under the press");
  assert.match(src, /useEffect\(\(\) => clearHold, \[\]\)/, "the timer must be cleared on unmount");
});

/* ---- actions reuse existing engines ---- */

check("M4: listen plays from the tapped ayah on the real audio engine", () => {
  const src = read(SHEET);
  assert.match(
    src,
    /loadSurah\(resolved\.chapter\.id, resolved\.verse\.number\)/,
    "must start the surah at the tapped ayah"
  );
  assert.match(src, /audio\.actions\.play\(\)/, "must play through the provider");
  assert.match(src, /audio\.actions\.pause\(\)/, "must offer pause while playing this ayah");
  assert.match(src, /audio\.error/, "engine errors must surface, not vanish");
  assert.match(src, /ReciterSheet/, "a missing reciter must open the shared picker");
});

check("M5: bookmark, copy and share reuse the AyahView handlers", () => {
  const src = read(SHEET);
  assert.match(src, /AyahActionBar/, "must reuse the shared action bar");
  assert.match(src, /quran\.toggleBookmark\(ayahRef\)/, "bookmark must hit the real store");
  assert.match(src, /quran\.isBookmarked\(ayahRef\)/, "bookmark state must read the real store");
  assert.match(src, /navigator\.clipboard\.writeText\(resolved\.verse\.text\)/, "copy must take the resolved text");
  assert.match(src, /shareVerseCard\(/, "share must use the card ladder with text fallback");
});

check("M6: tafsir prefers reviewed, then published, with the honest empty state", () => {
  const src = read(SHEET);
  assert.match(src, /quran\.getTafsir\(ayahRef\)/, "must read the curated store");
  assert.match(src, /TafsirSections/, "must reuse the tafsir renderer with its source credit");
  assert.match(
    src,
    /buildTafsirModel\(ayahRef, quran\.dataset, publishedSource\.entries\)/,
    "must layer reviewed entries above the pinned published edition"
  );
  assert.match(
    src,
    /usePublishedTafsirSource\(Boolean\(ayahRef\), ayahRef\)/,
    "the 2.9 MB pack must load only when an ayah is actually open"
  );
  assert.match(src, /tadabbur\.noTafsirTitle/, "a missing entry must say so, never invent tafsir");
});

check("M7: similar ayahs render only from verified relations", () => {
  const src = read(SHEET);
  assert.match(src, /quran\.getRelated\(ayahRef\)/, "must read the verified relations");
  assert.match(src, /related\.relatedAyahs\.length > 0/, "the section must hide when no data exists");
  assert.match(src, /RelatedItem/, "must reuse the related-ayah row");
});

check("M8: no translation action exists without translation data", () => {
  const src = read(SHEET);
  const hits = [...src.matchAll(/\bt\(\s*"([^"]*translat[^"]*)"/gi)].map((m) => m[1]);
  assert.equal(hits.length, 0, `translation rows without data: ${hits.join(", ")}`);
});

check("M9: no per-ayah notes system is duplicated", () => {
  const src = read(SHEET);
  assert.doesNotMatch(src, /journal|Journal/, "daily tadabbur owns notes; the sheet must not fork it");
  assert.doesNotMatch(src, /localStorage\.setItem/, "the sheet persists nothing of its own");
});

/* ---- dialog contract (shared Sheet carries the tested guarantees) ---- */

check("M10: the menu is a real dialog with a close path", () => {
  const src = read(SHEET);
  assert.match(src, /<Sheet open onClose/, "must use the shared accessible Sheet");
  assert.match(src, /onOpenAyah\(ayahRef\)/, "the full view stays one tap away");
  assert.match(src, /ayahMenu\.openDetails/, "the full-view action must be labelled");
});

/* ---- i18n: every static key in the new/retouched files resolves ---- */

function localeHas(key, dict) {
  const start = dict === "ar" ? 0 : read(LOCALE).indexOf("const EN:");
  const block = read(LOCALE).slice(start);
  return block.includes(`"${key}"`);
}

check("M11: every static t() key in the sheet and reader resolves in both languages", () => {
  const keys = new Set();
  for (const rel of [SHEET, READER]) {
    for (const m of read(rel).matchAll(/\bt\(\s*"([\w.]+)"/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 10, `expected a real key set, found ${keys.size}`);
  const missing = [...keys].filter((k) => !localeHas(k, "ar") || !localeHas(k, "en"));
  assert.equal(missing.length, 0, `unresolved keys: ${missing.join(", ")}`);
});

/* ---- frozen ground the menu must not move ---- */

check("M12: MushafReader is untouched (image pages have no ayah to tap)", () => {
  /* Do not duplicate the byte-hash pin here: test-w2.mjs C6 owns it in
     FROZEN_HASHES. Keeping a second copy made this test fail whenever the
     reader was legitimately re-pinned there. The invariant this test must
     protect is the tap surface, not the exact bytes. */
  const src = read("src/components/views/MushafReader.tsx");
  assert.ok(src.length > 100_000, "the reader source looks truncated");
  assert.ok(!src.includes("AyahActionsSheet"), "the sheet must not be wired into image pages");
});

/* ---- guard against a vacuous suite ---- */

check("M13: the sources under test were really read", () => {
  assert.ok(read(SHEET).length > 2000, "the sheet file looks empty");
  assert.ok(read(READER).includes("AyahActionsSheet"), "the reader must reference the sheet");
});

check("M14: the full ayah screen offers the same recitation control", () => {
  const src = read("src/components/views/Ayah.tsx");
  assert.match(src, /useAudioPlayer\(\)/, "the ayah screen must reuse the audio provider");
  assert.match(
    src,
    /loadSurah\(chapter\.id, verse\.number\)/,
    "recitation must start at the opened ayah"
  );
  assert.match(src, /audio\.actions\.play\(\)/, "play must go through the provider");
  assert.match(src, /audio\.actions\.pause\(\)/, "the same control must pause");
  assert.match(src, /ReciterSheet/, "a missing reciter must open the shared picker");
  assert.match(src, /audio\.error/, "engine errors must surface, not vanish");
});

check("M15: a cold player never disables the listen button", () => {
  /* useAudio reports isLoading for BOTH "idle" and "loading". Keying the
     button off isLoading left every fresh reader stuck on "loading recitation"
     with no way to open the reciter picker. */
  for (const file of [
    SHEET,
    "src/components/views/Ayah.tsx",
    "src/components/TadabburSheet.tsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /audio\.player\.isLoading/, file);
    assert.match(src, /audio\.player\.state === "loading"/, file);
  }
});

check("M16: play() cannot miss a track loaded in the same async action", () => {
  /* loadSurah() sets currentTrack, then the caller's await continuation calls
     play() before React has re-rendered. A render-time closure saw null and
     returned early, so the control looked right but never produced audio. */
  const src = read("src/components/providers/AudioProvider.tsx");
  assert.match(src, /currentTrackRef = useRef<AudioTrack \| null>\(null\)/);
  assert.match(src, /currentTrackRef\.current = track/);
  assert.match(src, /setTrack\(firstTrack\)/);
  assert.match(
    src,
    /const playCb = useCallback\(\(\) => \{[\s\S]{0,240}currentTrackRef\.current/
  );
  assert.doesNotMatch(
    src,
    /const playCb = useCallback\(\(\) => \{\s*if \(!currentTrack\) return;/
  );
});

check("M17: a mushaf tafsir deep link reaches the ayah screen", () => {
  /* The mushaf view used to be checked before quranRoute, so the "full tafsir"
     CTA set the route but kept rendering the reader. */
  const src = read("src/app/page.tsx");
  assert.match(src, /const renderQuranRoute = \(\) => \{/);
  const routeRenderer = src.slice(src.indexOf("const renderQuranRoute"));
  assert.match(routeRenderer, /quranRoute\?\.mode === "ayah"/);
  assert.match(routeRenderer, /<AyahView\b/);
  assert.match(routeRenderer, /quranRoute\?\.mode === "reader"/);
  assert.match(routeRenderer, /<QuranReaderView\b/);

  const mushaf = src.slice(
    src.indexOf('if (view === "mushaf")'),
    src.indexOf('if (view === "prayer")')
  );
  assert.ok(mushaf.length > 0, "the mushaf branch must exist");
  assert.match(mushaf, /const routed = renderQuranRoute\(\);/);
  assert.match(mushaf, /if \(routed\) return routed;/);
  assert.ok(
    mushaf.indexOf("if (routed) return routed;") < mushaf.indexOf("<MushafReaderView"),
    "the route must win before the reader is rendered"
  );
});

console.log(`\nAyah menu: ${passed}/${passed + failed} passed`);
if (failed) {
  console.log(`${failed} failure(s)`);
  process.exit(1);
}
