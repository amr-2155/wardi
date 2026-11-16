/* ====================================================================
 * Verify the Hisn al-Muslim recordings the adhkar point at
 * ====================================================================
 * The hadith cards only carry a `hisnId` after the recording's words were
 * matched to the card's by hand. This script exists so that claim can be
 * re-checked against the live source at any time:
 *
 *   - every id the dataset references must serve a real mp3 (HTTP 206,
 *     `audio/mpeg` with a byte range), and
 *   - the file must name the reciter we credit ("حمد الدريهم") in its own
 *     ID3 `TPE1` tag, so no voice is attributed by guesswork.
 *
 * It needs the network, so it is NOT part of `npm test`; run
 * `npm run verify:hisn` by hand, like `npm run verify:verses`.
 * ==================================================================== */

import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const src = readFileSync(new URL("src/data/adhkar.ts", root), "utf8");

const pairs = [...src.matchAll(/id: "([^"]+)",\r?\n    hisnId: (\d+),/g)].map((m) => ({
  card: m[1],
  id: Number(m[2]),
}));
if (pairs.length === 0) {
  console.error("no hisnId references found — the extraction regex is blind");
  process.exit(1);
}
console.log(`checking ${pairs.length} Hisn al-Muslim recordings`);

/** Read the ID3v2 TPE1 text frame, honouring its encoding byte. */
function readTpe1(buf) {
  if (!(buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)) return "";
  const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
  let p = 10;
  const end = Math.min(10 + size, buf.length);
  while (p + 10 <= end) {
    const tag = buf.toString("latin1", p, p + 4);
    const fsz = (buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7];
    if (!/^[A-Z0-9]{4}$/.test(tag) || fsz <= 0) break;
    if (tag === "TPE1") {
      const body = buf.subarray(p + 10, p + 10 + fsz);
      const text = body[0] === 1 ? body.subarray(1).toString("utf16le") : body.subarray(1).toString("utf8");
      return text.replace(/\0+$/g, "").replace(/^\uFEFF/, "");
    }
    p += 10 + fsz;
  }
  return "";
}

let ok = 0;
const problems = [];
for (const { card, id } of pairs) {
  const url = `https://www.hisnmuslim.com/audio/ar/${id}.mp3`;
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-2047" } });
    const type = res.headers.get("content-type");
    const range = res.headers.get("content-range");
    if (res.status !== 206 || type !== "audio/mpeg" || !range) {
      problems.push(`${card} #${id}: status=${res.status} type=${type} range=${range}`);
      continue;
    }
    const reciter = readTpe1(Buffer.from(await res.arrayBuffer()));
    if (!reciter.includes("حمد الدريهم")) {
      problems.push(`${card} #${id}: reciter tag is "${reciter || "absent"}"`);
      continue;
    }
    ok += 1;
  } catch (err) {
    problems.push(`${card} #${id}: ${String(err).slice(0, 120)}`);
  }
}

console.log(`verified: ${ok}/${pairs.length}`);
if (problems.length) {
  console.log("problems:");
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
