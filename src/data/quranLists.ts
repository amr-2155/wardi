/**
 * Quranic duas and prostration ayahs, as dataset references only. The verse
 * text is always rendered from the bundled, verified Quran dataset at display
 * time - nothing is copied here, so this file cannot drift from the mushaf
 * text. Curation is limited to well-known references; no tafsir or wording
 * is added.
 */

/** Well-known supplications that are themselves Quran ayahs ("surah:ayah"). */
export const QURAN_DUA_REFS: string[] = [
  "2:127",
  "2:128",
  "2:201",
  "2:250",
  "2:286",
  "3:8",
  "3:16",
  "3:53",
  "3:147",
  "7:23",
  "14:40",
  "14:41",
  "17:24",
  "17:80",
  "18:10",
  "20:114",
  "21:87",
  "21:89",
  "23:118",
  "25:74",
  "27:19",
  "28:16",
  "28:24",
  "46:15",
  "59:10",
  "71:28",
];

/** The fourteen widely-attested ayahs of tilawa prostration. */
export const SAJDA_REFS: string[] = [
  "7:206",
  "13:15",
  "16:50",
  "17:109",
  "19:58",
  "22:18",
  "25:60",
  "27:26",
  "32:15",
  "38:24",
  "41:37",
  "53:62",
  "84:21",
  "96:19",
];
