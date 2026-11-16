/**
 * Splitting a Quran passage into words + ayah markers.
 *
 * The adhkar dataset stores a passage inline, with "(1)" / "(2)"… marking the
 * end of each verse. Keeping the split here (pure, no React, no locale) means
 * the mushaf renderer and the tests share one definition of where a verse ends,
 * and a malformed marker can never silently swallow the rest of the text.
 */

export type MushafPart = { kind: "words"; text: string } | { kind: "ayah"; n: number };

export function parseMushafParts(text: string): MushafPart[] {
  const parts: MushafPart[] = [];
  const marker = /\((\d+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text)) !== null) {
    const before = text.slice(last, match.index).trim();
    if (before) parts.push({ kind: "words", text: before });
    parts.push({ kind: "ayah", n: Number(match[1]) });
    last = match.index + match[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) parts.push({ kind: "words", text: rest });
  return parts;
}

/** True when the passage actually carries ayah markers. */
export function hasAyahMarkers(text: string): boolean {
  return /\(\d+\)/.test(text);
}
