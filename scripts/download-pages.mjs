// Downloads all 604 Madani Mushaf page images into public/quran/pages/ as WebP.
// Source: https://github.com/Bsraccc1/daily-quran (MIT) — "Mushaf Madinah pages"
// asset files, per README sourced from King Fahd Glorious Quran Printing Complex.
import { mkdirSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "quran", "pages");
const BASE =
  "https://raw.githubusercontent.com/Bsraccc1/daily-quran/main/app/src/main/assets/mushaf_pages/page_";

const TOTAL = 604;
const CONCURRENCY = 8;
const RETRIES = 3;

mkdirSync(OUT, { recursive: true });

const pad = (n) => String(n).padStart(3, "0");

async function downloadOne(n) {
  const target = join(OUT, `${n}.webp`);
  try {
    if (statSync(target).size > 2048) return 0;
  } catch {
    /* missing */
  }
  const url = `${BASE}${pad(n)}.webp`;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2048 && buf[0] === 0x52 && buf[1] === 0x49) {
        writeFileSync(target, buf);
        return buf.length;
      }
      throw new Error(`bad payload (${buf.length})`);
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
  console.log(`downloading ${TOTAL} pages -> ${OUT}`);
  const queue = Array.from({ length: TOTAL }, (_, i) => i + 1);
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < queue.length) {
      const n = queue[cursor];
      cursor += 1;
      await downloadOne(n);
    }
  });
  await Promise.all(workers);

  let bytes = 0;
  let missing = 0;
  for (let n = 1; n <= TOTAL; n += 1) {
    try {
      const s = statSync(join(OUT, `${n}.webp`));
      if (s.size <= 2048) throw new Error("too small");
      bytes += s.size;
    } catch {
      missing += 1;
      console.error(`  missing page ${n}`);
    }
  }
  console.log(`done: ${TOTAL - missing}/${TOTAL} pages, ${(bytes / 1024 / 1024).toFixed(1)} MiB total`);
  if (missing > 0) process.exit(1);
}

const existing = readdirSync(OUT).filter((f) => f.endsWith(".webp")).length;
if (existing >= TOTAL) {
  console.log(`already present: ${existing} page(s) — nothing to do`);
} else {
  await run();
}