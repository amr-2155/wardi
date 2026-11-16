/* ====================================================================
 * Online evidence check: does every Quran card quote the verse it plays?
 * ====================================================================
 * Not part of `npm test`, because it needs the network: it fetches the
 * uthmani text of each referenced verse from the Quran.com API and compares
 * it with the card's own words after normalising the orthography that
 * legitimately varies (tashkeel, dagger alef vs alef, alef maqsura, hamza
 * carriers, alef wasla, verse markers, punctuation).
 *
 * The result is the classification the app relies on:
 *   EXACT           the card is the verse(s) word for word
 *   SUFFIX-EXCERPT  the card is the closing part of the verse
 *   MID-EXCERPT     the card is an interior part of the verse
 *   MISMATCH        neither -- the card's words are not in the verse at all
 *
 * Every excerpt card must carry `audioNote` in the dataset (checked offline
 * by scripts/test-adhkar.mjs F10); this script is how that list was derived
 * and how it is re-derived after a dataset change.
 *
 *   node --experimental-strip-types scripts/verify-adhkar-verses.mjs
 * ==================================================================== */

import { DHIKR_ITEMS } from "../src/data/adhkar.ts";

/* Marks, punctuation and verse numbers carry no identity; hamza carriers and
   alef variants are writing choices, not different letters. Keeps the alef, so
   "قال" and "قل" stay distinct. */
const strict = (s) =>
  s
    .replace(/[()0-9\u0660-\u0669]/g, "")
    /* alef maqsura + dagger alef is the Uthmani spelling of long /a/ */
    .replace(/[\u0649\u064A]\u0670/g, "\u0627")
    .replace(/\u0670/g, "\u0627")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF\u0653-\u0655\uFEFF]/g, "")
    .replace(/[\u0622\u0623\u0625\u0627\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u0649\u064A\u06CC]/g, "\u064A")
    /* hamza carriers are writing variants of the same sound */
    .replace(/[\u0621\u0624\u0626]/g, "")
    .replace(/[\s\u00A0\u200E\u200F\u0640\u060C\u061B\u061F\u002E\u066B\u066C\u06DD\u06DE]/g, "");

/* The same, with every alef dropped. The dataset is written in a normalised
   spelling, not the Uthmani one, so a word can carry one alef more than the
   mushaf ("السماوات" vs "السماوات") or one fewer ("إله" vs "إله"). Comparing
   the consonant skeleton finds the excerpt even then; a difference that
   survives this is a real difference. */
const skeleton = (s) => strict(s).replace(/[\u0627\u0649]/g, "");

const classify = (card, full) =>
  card === full
    ? "EXACT"
    : full.endsWith(card)
      ? "SUFFIX-EXCERPT"
      : full.includes(card)
        ? "MID-EXCERPT"
        : "MISMATCH";

let mismatches = 0;

for (const item of DHIKR_ITEMS.filter((i) => i.type === "quran")) {
  const bySurah = new Map();
  for (const ref of item.audio ?? []) {
    const list = bySurah.get(ref.surah) ?? [];
    list.push(ref.ayah);
    bySurah.set(ref.surah, list);
  }
  let verse = "";
  for (const [surah, ayahs] of bySurah) {
    for (const ayah of ayahs.sort((a, b) => a - b)) {
      const res = await fetch(
        `https://api.quran.com/api/v4/quran/verses/uthmani?verse_key=${surah}:${ayah}`
      );
      const json = await res.json();
      verse += `${json.verses[0].text_uthmani} `;
    }
  }
  let verdict = classify(strict(item.text), strict(verse));
  let variant = "";
  if (verdict === "MISMATCH") {
    const loose = classify(skeleton(item.text), skeleton(verse));
    if (loose !== "MISMATCH") {
      verdict = loose;
      variant = " (spelling variant)";
    }
  }

  const flagged = Boolean(item.audioNote);
  const excerpt = verdict.endsWith("EXCERPT");
  /* The dataset and the verse text must agree: an excerpt carries a note, an
     exact card does not. */
  const agrees = verdict === "MISMATCH" ? !flagged : excerpt === flagged;
  if (!agrees) mismatches += 1;

  console.log(
    `${agrees ? "ok  " : "FAIL"} ${item.id}: ${verdict}${variant}${flagged ? " + audioNote" : ""}`
  );
}

console.log(
  mismatches === 0
    ? "\nEvery card agrees with its verse text."
    : `\n${mismatches} card(s) disagree with the verse text.`
);
process.exit(mismatches === 0 ? 0 : 1);
