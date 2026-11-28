// Downloads all 604 Madani Mushaf page images into public/quran/pages/ as WebP.
//
// The original source (github.com/Bsraccc1/daily-quran) is gone (404). The
// replacement mirror is Five-Prayers/quran-pages: the same King Fahd Complex
// Madani pages as 1280x2071 ink-on-transparent PNGs. Each PNG is converted to
// WebP with sharp (already a transitive dependency of Next).
//
// Usage:
//   node scripts/download-pages.mjs            # all 604 pages, skips existing
//   node scripts/download-pages.mjs 1 10       # pages 1..10 only
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "quran", "pages");
const BASE = "https://raw.githubusercontent.com/Five-Prayers/quran-pages/HEAD/quran_pages/";

const TOTAL = 604;
const CONCURRENCY = 8;
const RETRIES = 3;

const from = Math.max(1, Number(process.argv[2]) || 1);
const to = Math.min(TOTAL, Number(process.argv[3]) || TOTAL);

mkdirSync(OUT, { recursive: true });

async function downloadOne(n) {
  const target = join(OUT, `${n}.webp`);
  try {
    if (statSync(target).size > 2048) return 0;
  } catch {
    /* missing */
  }
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${n}.png`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const png = Buffer.from(await res.arrayBuffer());
      if (png.length <= 2048) throw new Error(`bad payload (${png.length})`);
      const webp = await sharp(png).webp({ lossless: true }).toBuffer();
      if (webp[0] !== 0x52 || webp[1] !== 0x49) throw new Error("webp encode failed");
      writeFileSync(target, webp);
      return webp.length;
    } catch (err) {
      if (attempt === RETRIES) {
        console.error(`  FAIL page ${n}: ${err.message}`);
        return -1;
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return -1;
}

async function run() {
  let done = 0;
  let failed = 0;
  let skipped = 0;
  const queue = [];
  for (let n = from; n <= to; n += 1) queue.push(n);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const n = queue.shift();
        const r = await downloadOne(n);
        if (r === 0) skipped += 1;
        else if (r < 0) failed += 1;
        else done += 1;
        if ((done + skipped + failed) % 25 === 0) {
          console.log(`... ${done + skipped + failed}/${to - from + 1}`);
        }
      }
    })
  );
  console.log(`done: ${done} downloaded, ${skipped} already present, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();
