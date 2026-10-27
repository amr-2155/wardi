/**
 * Share a verse (or the day's ward) as a generated PNG card.
 *
 * The app already had three text-only `navigator.share` call sites. Those stay
 * the fallback; this adds the image share on top, using the same ladder:
 * image -> text -> clipboard.
 *
 * Canvas notes:
 *  - `ctx.font` cannot take a CSS variable, and both app fonts are declared
 *    through one (`next/font` sets only `--font-*`). So the family name is
 *    resolved by measuring a probe element and reading the computed value back.
 *  - The font must be *loaded*, not merely named. Drawing before the face is
 *    ready silently produces fallback glyphs, which for Arabic means wrong
 *    shaping — the exact mojibake-looking corruption this file must not cause.
 *  - Arabic shaping and bidi are handled by the canvas itself; only the
 *    direction needs setting.
 */

export type ShareCardTheme = "light" | "dark";

export type VerseCardInput = {
  /** Uthmani verse text. */
  text: string;
  /** Already-resolved, human-readable reference, e.g. "Al-Baqarah · 2:255". */
  reference: string;
  /** Small line above the verse, e.g. "Verse of the day". */
  eyebrow?: string;
  /** Bottom-left caption, typically the app name. */
  appName: string;
  theme?: ShareCardTheme;
};

const WIDTH = 1080;
/** 4:5 — the shape social platforms crop least aggressively. */
const MAX_HEIGHT = 1350;

type Palette = {
  bg: string;
  bgEdge: string;
  frame: string;
  eyebrow: string;
  verse: string;
  reference: string;
  appName: string;
};

const LIGHT: Palette = {
  bg: "#fdfaf3",
  bgEdge: "#f3ead6",
  frame: "#c9a961",
  eyebrow: "#9a7b32",
  verse: "#0e2b21",
  reference: "#5c6b63",
  appName: "#8a7340",
};

const DARK: Palette = {
  bg: "#0e2b21",
  bgEdge: "#081c15",
  frame: "#b18a3e",
  eyebrow: "#d9b96a",
  verse: "#f6f1e4",
  reference: "#a9b8b0",
  appName: "#c8ab72",
};

/**
 * Resolve a `--font-*` variable to a concrete font-family list.
 *
 * Reads the computed style back off a throwaway element instead of hard-coding
 * the generated family name, which changes when the `next/font` call changes.
 */
function resolveFontFamily(cssVar: string): string {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.fontFamily = `var(${cssVar})`;
  probe.textContent = "x";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family && family !== "serif" ? family : "serif";
}

/**
 * Force the faces to be ready before any text is measured or drawn.
 *
 * Returns nothing; failures are swallowed because the caller has a text
 * fallback and a missing face must not break sharing.
 */
async function ensureFontsLoaded(families: string[]): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  try {
    await Promise.all(
      families.flatMap((family) => [
        document.fonts.load(`400 40px ${family}`),
        document.fonts.load(`700 24px ${family}`),
        document.fonts.load(`800 30px ${family}`),
      ])
    );
    await document.fonts.ready;
  } catch {
    // best-effort: drawing with a fallback face is better than not sharing
  }
}

/** Greedy word wrap. Arabic breaks on spaces, and the canvas measures the
    already-shaped run, so per-word measurement is reliable. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function render(
  ctx: CanvasRenderingContext2D,
  input: VerseCardInput,
  palettes: { quran: string; ui: string }
): Promise<HTMLCanvasElement> {
  const p = input.theme === "dark" ? DARK : LIGHT;

  // Two passes: measure at a fixed canvas height to pick the verse font size,
  // then lay out for real. Sizing by content avoids a card that is mostly
  // empty for a short ayah or one that overflows for a long one.
  const measure = document.createElement("canvas").getContext("2d");
  const PAD = 96;
  const inner = WIDTH - PAD * 2;
  const LINE_GAP = 1.65;

  let fontSize = 56;
  let lines: string[] = [];
  let lineHeight = 0;

  if (measure) {
    measure.direction = "rtl";
    for (const candidate of [58, 54, 50, 46, 42, 38, 34, 30]) {
      measure.font = `400 ${candidate}px ${palettes.quran}`;
      const wrapped = wrapLines(measure, input.text, inner);
      const lh = candidate * LINE_GAP;
      const total = lh * wrapped.length;
      const height = 300 + total + 190;
      if (height <= MAX_HEIGHT || candidate === 30) {
        fontSize = candidate;
        lines = wrapped;
        lineHeight = lh;
        break;
      }
    }
    if (!lines.length) {
      measure.font = `400 ${fontSize}px ${palettes.quran}`;
      lines = wrapLines(measure, input.text, inner);
      lineHeight = fontSize * LINE_GAP;
    }
  }

  const verseBlock = lineHeight * lines.length;
  const height = Math.min(MAX_HEIGHT, Math.max(900, 300 + verseBlock + 190));
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;

  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas 2d unavailable");

  // Background wash.
  const bg = g.createLinearGradient(0, 0, WIDTH, height);
  bg.addColorStop(0, p.bg);
  bg.addColorStop(1, p.bgEdge);
  g.fillStyle = bg;
  g.fillRect(0, 0, WIDTH, height);

  // Inner frame.
  g.strokeStyle = p.frame;
  g.lineWidth = 3;
  roundRect(g, 44, 44, WIDTH - 88, height - 88, 28);
  g.stroke();
  g.globalAlpha = 0.35;
  roundRect(g, 58, 58, WIDTH - 116, height - 116, 20);
  g.stroke();
  g.globalAlpha = 1;

  g.textAlign = "center";
  g.direction = "rtl";

  let y = 150;

  if (input.eyebrow) {
    g.font = `700 24px ${palettes.ui}`;
    g.fillStyle = p.eyebrow;
    g.fillText(input.eyebrow, WIDTH / 2, y);
    y += 56;
  }

  // Decorative rule.
  g.strokeStyle = p.frame;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(WIDTH / 2 - 60, y - 24);
  g.lineTo(WIDTH / 2 + 60, y - 24);
  g.stroke();
  y += 44;

  g.font = `400 ${fontSize}px ${palettes.quran}`;
  g.fillStyle = p.verse;
  for (const line of lines) {
    y += lineHeight;
    g.fillText(line, WIDTH / 2, y);
  }

  // Reference.
  y += 76;
  g.font = `800 30px ${palettes.ui}`;
  g.fillStyle = p.reference;
  g.fillText(input.reference, WIDTH / 2, y);

  // Footer.
  g.font = `700 24px ${palettes.ui}`;
  g.fillStyle = p.appName;
  g.fillText(input.appName, WIDTH / 2, height - 96);

  return canvas;
}

/**
 * Build the PNG. Returns null when the environment cannot produce one, so the
 * caller can drop to the text share instead of failing.
 */
export async function createVerseCard(input: VerseCardInput): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const quran = resolveFontFamily("--font-quran-var");
  const ui = resolveFontFamily("--font-cairo");
  await ensureFontsLoaded([quran, ui]);
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    const canvas = await render(ctx, input, { quran, ui });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) return null;
    const safeRef = input.reference.replace(/[^\w؀-ۿ -]/g, "").trim().replace(/\s+/g, "-");
    return new File([blob], `wardi-${safeRef || "verse"}.png`, { type: "image/png" });
  } catch {
    return null;
  }
}

/**
 * Share the card as an image, falling back to `onFallback` (a text share) when
 * the platform has no file share — most notably the in-app WebView.
 */
export async function shareVerseCard(
  input: VerseCardInput,
  onFallback: () => Promise<void>
): Promise<void> {
  try {
    const file = await createVerseCard(input);
    if (!file) {
      await onFallback();
      return;
    }
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: input.reference });
      return;
    }
  } catch {
    // fall through to the text path
  }
  await onFallback();
}

export type WeekCardInput = {
  /** Four pre-localized stat cells, e.g. { label: "pages", value: "120" }. */
  rows: { label: string; value: string }[];
  headline: string;
  subline: string;
  appName: string;
  rtl?: boolean;
  theme?: ShareCardTheme;
};

function renderWeek(
  input: WeekCardInput,
  palettes: { quran: string; ui: string }
): HTMLCanvasElement {
  const p = input.theme === "dark" ? DARK : LIGHT;
  const height = 1180;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas 2d unavailable");

  const bg = g.createLinearGradient(0, 0, WIDTH, height);
  bg.addColorStop(0, p.bg);
  bg.addColorStop(1, p.bgEdge);
  g.fillStyle = bg;
  g.fillRect(0, 0, WIDTH, height);

  g.strokeStyle = p.frame;
  g.lineWidth = 3;
  roundRect(g, 44, 44, WIDTH - 88, height - 88, 28);
  g.stroke();
  g.globalAlpha = 0.35;
  roundRect(g, 58, 58, WIDTH - 116, height - 116, 20);
  g.stroke();
  g.globalAlpha = 1;

  g.textAlign = "center";
  g.direction = input.rtl === false ? "ltr" : "rtl";

  let y = 170;
  g.font = `800 64px ${palettes.ui}`;
  g.fillStyle = p.verse;
  g.fillText(input.headline, WIDTH / 2, y);
  y += 64;
  g.font = `700 30px ${palettes.ui}`;
  g.fillStyle = p.eyebrow;
  g.fillText(input.subline, WIDTH / 2, y);

  // 2x2 stat cells.
  const gap = 28;
  const cellW = (WIDTH - 88 - 58 * 2 - gap) / 2;
  const cellH = 250;
  const x0 = 44 + 58;
  const cy = y + 70;
  input.rows.slice(0, 4).forEach((row, i) => {
    const col = i % 2;
    const rowi = Math.floor(i / 2);
    // In RTL the first cell sits on the right.
    const rtl = g.direction === "rtl";
    const cx = x0 + (rtl ? (1 - col) : col) * (cellW + gap);
    const cyy = cy + rowi * (cellH + gap);
    g.fillStyle = p.bgEdge;
    roundRect(g, cx, cyy, cellW, cellH, 24);
    g.fill();
    g.font = `800 84px ${palettes.ui}`;
    g.fillStyle = p.verse;
    g.fillText(row.value, cx + cellW / 2, cyy + 140);
    g.font = `700 30px ${palettes.ui}`;
    g.fillStyle = p.reference;
    g.fillText(row.label, cx + cellW / 2, cyy + 200);
  });

  g.font = `700 24px ${palettes.ui}`;
  g.fillStyle = p.appName;
  g.fillText(input.appName, WIDTH / 2, height - 96);
  return canvas;
}

/** Build the weekly-report PNG. Null when the environment cannot produce one. */
export async function createWeekCard(input: WeekCardInput): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const ui = resolveFontFamily("--font-cairo");
  await ensureFontsLoaded([ui]);
  try {
    const canvas = renderWeek(input, { quran: ui, ui });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
    if (!blob) return null;
    return new File([blob], "wardi-week.png", { type: "image/png" });
  } catch {
    return null;
  }
}

/** Share the weekly card as an image, falling back to `onFallback`. */
export async function shareWeekCard(
  input: WeekCardInput,
  onFallback: () => Promise<void>
): Promise<void> {
  try {
    const file = await createWeekCard(input);
    if (!file) {
      await onFallback();
      return;
    }
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: input.headline });
      return;
    }
  } catch {
    // fall through to the text path
  }
  await onFallback();
}