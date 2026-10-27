"use client";

import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Headphones,
  Info,
  Library,
  List,
  LocateFixed,
  MoreHorizontal,
  Palette,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { useLocale } from "@/lib/locale";
import type { QuranData } from "@/hooks/useQuran";
import type { WardData } from "@/hooks/useWardData";
import { pageAyahs, pageDwellFactor, pageInfo, toArabicIndic } from "@/lib/quran/mushaf";
import {
  loadMushafTheme,
  saveMushafTheme,
  MUSHAF_THEMES,
  type MushafThemeId,
} from "@/lib/quran/readerTheme";
import { getGlobalId, resolveAyah } from "@/lib/quran/validate";
import { getGlobalIdOfRef } from "@/lib/quran/search";
import { refFromGlobalId } from "@/lib/quran/progress";
import {
  loadLastPage,
  loadSession,
  defaultSession,
  saveLastPage,
  saveSession,
  loadQuranSession,
  saveQuranSession,
  loadQuranLastPage,
  saveQuranLastPage,
  sanitizeBookmarks,
  type MushafSession,
  type MushafSource,
} from "@/lib/quran/mushafSession";
import { useAudioPlayer } from "@/components/providers/AudioProvider";
import { ReciterSheet } from "@/components/audio/ReciterSheet";
import { ProgressRing } from "@/components/ProgressRing";
import { SegmentedControl } from "@/components/SegmentedControl";
import type { ReaderMode } from "@/components/SegmentedControl";
import {
  loadMushafFit,
  saveMushafFit,
  MUSHAF_FITS,
  type MushafFitId,
} from "@/lib/quran/readerTheme";
import { GLYPH_BOXES } from "@/lib/quran/glyphBoxes";
import { setImmersive } from "@/lib/immersive";

/* Page scans are 1024×1656 px with transparent margins baked in. We measure the
   actual glyph bounding box per page once (cached) and crop the empty margins so
   the verse block — not the paper — fills the screen. */
const PAGE_W = 1024;
const PAGE_H = 1656;
const GLYPH_KEY = "ward:v2:mushaf:glyph-box-v3";

type GlyphBox = { l: number; t: number; r: number; b: number };

/* Radical fix: per-page boxes measured ONCE offline (scripts/build-glyph-boxes.mjs)
   with an adaptive paper-tone threshold. Exact ink bounds for all 604 pages —
   no runtime canvas cost, no fragile guards, maximal width-fill, zero clipping. */
function precomputedGlyph(page: number): GlyphBox | null {
  const b = GLYPH_BOXES[page];
  if (!b) return null;
  const PAD = 4;
  return {
    l: Math.max(0, b[0] - PAD),
    t: Math.max(0, b[1] - PAD),
    r: Math.min(PAGE_W - 1, b[2] + PAD),
    b: Math.min(PAGE_H - 1, b[3] + PAD),
  };
}

function loadGlyphCache(): Map<number, GlyphBox> {
  const m = new Map<number, GlyphBox>();
  try {
    const raw = localStorage.getItem(GLYPH_KEY);
    if (!raw) return m;
    const obj = JSON.parse(raw) as Record<string, [number, number, number, number]>;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      m.set(Number(k), { l: v[0], t: v[1], r: v[2], b: v[3] });
    }
  } catch {
    /* ignore */
  }
  return m;
}

function persistGlyphCache(map: Map<number, GlyphBox>): void {
  try {
    const obj: Record<string, [number, number, number, number]> = {};
    map.forEach((box, k) => {
      obj[String(k)] = [box.l, box.t, box.r, box.b];
    });
    localStorage.setItem(GLYPH_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

function measureGlyphBox(origin: HTMLImageElement | HTMLCanvasElement): GlyphBox | null {
  try {
    const c = document.createElement("canvas");
    c.width = PAGE_W;
    c.height = PAGE_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(origin, 0, 0, PAGE_W, PAGE_H);
    const d = ctx.getImageData(0, 0, PAGE_W, PAGE_H).data;
    // Border tone (paper margin color): median of edge samples. Works for
    // opaque scans (alpha test alone would never crop those) as well as
    // transparent-margin exports.
    const edge: number[] = [];
    const STEP = 8;
    for (let x = 0; x < PAGE_W; x += STEP) {
      edge.push(x, x + (PAGE_H - 1) * PAGE_W);
    }
    for (let y = 0; y < PAGE_H; y += STEP) {
      edge.push(y * PAGE_W, y * PAGE_W + (PAGE_W - 1));
    }
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (const i of edge) {
      if (d[i * 4 + 3] > 32) {
        rs.push(d[i * 4]);
        gs.push(d[i * 4 + 1]);
        bs.push(d[i * 4 + 2]);
      }
    }
    if (rs.length === 0) {
      // Fully transparent edges: fall back to a pure-alpha bounding box.
      let l = PAGE_W;
      let t = PAGE_H;
      let r = 0;
      let b = 0;
      for (let y = 0; y < PAGE_H; y += 2) {
        for (let x = 0; x < PAGE_W; x += 2) {
          if (d[(y * PAGE_W + x) * 4 + 3] > 32) {
            if (x < l) l = x;
            if (x > r) r = x;
            if (y < t) t = y;
            if (y > b) b = y;
          }
        }
      }
      if (l >= r || t >= b) return null;
      return { l, t, r, b };
    }
    const med = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y);
      return s[Math.floor(s.length / 2)];
    };
    const br = med(rs);
    const bg = med(gs);
    const bb = med(bs);
    // A pixel counts as content when it is transparent OR clearly differs
    // from the paper tone (ink, frames, ornaments, surah headers).
    const TOL = 26;
    const isContent = (i: number) => {
      if (d[i * 4 + 3] <= 32) return false;
      const dr = Math.abs(d[i * 4] - br);
      const dg = Math.abs(d[i * 4 + 1] - bg);
      const db = Math.abs(d[i * 4 + 2] - bb);
      return Math.max(dr, dg, db) > TOL;
    };
    // A row/column counts as content when enough of it differs (robust to
    // specks, page numbers and isolated ornaments near the edges).
    const rowHits = (y: number) => {
      let n = 0;
      for (let x = 0; x < PAGE_W; x += 4) if (isContent(y * PAGE_W + x)) n++;
      return n;
    };
    const colHits = (x: number) => {
      let n = 0;
      for (let y = 0; y < PAGE_H; y += 4) if (isContent(y * PAGE_W + x)) n++;
      return n;
    };
    const ROW_MIN = Math.max(2, Math.floor(PAGE_W / 4 / 90));
    const COL_MIN = Math.max(2, Math.floor(PAGE_H / 4 / 90));
    let t = 0;
    while (t < PAGE_H && rowHits(t) < ROW_MIN) t += 2;
    let b = PAGE_H - 1;
    while (b > t && rowHits(b) < ROW_MIN) b -= 2;
    let l = 0;
    while (l < PAGE_W && colHits(l) < COL_MIN) l += 2;
    let r = PAGE_W - 1;
    while (r > l && colHits(r) < COL_MIN) r -= 2;
    if (l >= r || t >= b) return null;
    // Conservative: never crop away more than ~half the page (protects
    // sparse pages and keeps every ayah number + frame intact).
    if ((r - l) * (b - t) < PAGE_W * PAGE_H * 0.38) return null;
    // Small breathing room so frames/numbers never touch the screen edge.
    const PAD = 4;
    return {
      l: Math.max(0, l - PAD),
      t: Math.max(0, t - PAD),
      r: Math.min(PAGE_W - 1, r + PAD),
      b: Math.min(PAGE_H - 1, b + PAD),
    };
  } catch {
    return null;
  }
}

function fitGlyph(
  area: { w: number; h: number },
  mode: MushafFitId,
  box: GlyphBox | null,
): { w: number; h: number; placeLeft: number; placeTop: number; imgW: number; imgH: number } {
  /* "page" measures the printed page itself, not the glyph block, so the sheet
     — including its frame and margins — is shown whole and never cropped. */
  const whole = mode === "page" || !box;
  const cw = whole ? PAGE_W : box.r - box.l;
  const ch = whole ? PAGE_H : box.b - box.t;
  const offX = whole ? 0 : box.l;
  const offY = whole ? 0 : box.t;
  const ratio = cw / ch;
  const aw = area.w;
  const ah = area.h;
  let bw = Math.min(aw, ah * ratio);
  let bh = bw / ratio;
  if (mode === "full") {
    // Full-bleed crop: the page fills the whole stage edge-to-edge (like the
    // Tarteel reader). Slightly crops the text margins — that's the trade of
    // a filled screen; choose "width"/"cozy" to keep every glyph visible.
    const s = Math.max(aw / cw, ah / ch);
    bw = cw * s;
    bh = ch * s;
  } else if (mode === "width") {
    bw = aw;
    bh = bw / ratio;
    if (bh > ah) {
      bh = ah;
      bw = bh * ratio;
    }
  } else if (mode === "cozy") {
    bw *= 0.98;
    bh *= 0.98;
  }
  bw = Math.max(1, Math.floor(bw));
  bh = Math.max(1, Math.floor(bh));
  const s = bw / cw;
  return {
    w: bw,
    h: bh,
    placeLeft: (bw - cw * s) / 2 - offX * s,
    placeTop: (bh - ch * s) / 2 - offY * s,
    imgW: Math.floor(PAGE_W * s),
    imgH: Math.floor(PAGE_H * s),
  };
}

/* Accent color is a CSS custom property so every surface follows the theme. */
const GOLD = "var(--mgold)";
const SWIPE_THRESHOLD = 60;
const DOUBLE_TAP_MS = 300;
const ADVANCE_MS = 520;
const MAX_ZOOM = 3.5;
const ZERO = { scale: 1, tx: 0, ty: 0 };
const PILL_SHOW_MS = 1500;
/* The tools are overlays, so the reader starts with the page alone; once a tap
   reveals them they fade out again after five idle seconds. */
const CHROME_HIDE_MS = 5000;
/* Movement at or below this distance counts as a tap, not a scroll. */
const TAP_SLOP_PX = 12;

/* Auto-scroll engine: one page turn per interval, divided by the speed
   multiplier (1 → normal, below 1 → slower). */
const AUTO_SCROLL_BASE_MS = 6000;
const AUTO_SPEEDS = [0.15, 0.25, 0.35, 0.5, 0.75, 1] as const;

/* Guided reading flow: while zoomed in, each press glides the page down by
   ~30% of the stage height; reaching the bottom advances to the next page
   while reading size is kept. In the fit view the arrows walk continuously. */

/* Gradual walking: the down/up arrows roll the mushaf page-by-page at the
   reading speed. The ribbon advances one page per WALK_STEPS_PER_PAGE ticks. */
const WALK_STEP_MS = 60;
const WALK_STEPS_PER_PAGE = 26;

type TouchPoint = { clientX: number; clientY: number };

/* Module scope (not per-render): stable identity for gesture callbacks. */
function touchDist(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/* One ribbon slot in the gradual walk. memo'd on primitive props only: while
   the walk runs the parent re-renders on every committed page, but the slot
   imgs must stay untouched (their `src` is swapped imperatively in the walk
   interval in perfect sync with the ribbon transform). */
const WalkPage = memo(function WalkPage({
  src,
  boxW,
  boxH,
  placeLeft,
  placeTop,
  imgW,
  imgH,
  imgRef,
}: {
  src: number;
  boxW: number;
  boxH: number;
  placeLeft: number;
  placeTop: number;
  imgW: number;
  imgH: number;
  imgRef: React.RefObject<HTMLImageElement | null>;
}) {
  return (
    <div className="absolute left-0 overflow-hidden" style={{ width: boxW, height: boxH, top: 0 }}>
      <img
        ref={imgRef}
        src={`/quran/pages/${src}.webp`}
        alt=""
        draggable={false}
        decoding="async"
        className="mushaf-glyphs pointer-events-none select-none"
        style={{
          position: "absolute",
          left: placeLeft,
          top: placeTop,
          width: imgW,
          height: imgH,
          maxWidth: "none",
          maxHeight: "none",
        }}
      />
    </div>
  );
});

function clampValue(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function clampPage(p: number, from: number, to: number): number {
  return clampValue(p, from, to);
}

/* Page-based ward progress from a session's monotonic highest page.
   Opening the ward counts page 1 (1/25 → 4%); the last page counts 25/25. */
function wardReachedOf(s: MushafSession, start: number, end: number): number {
  const high = Number.isFinite(s.highestPageReached) ? s.highestPageReached : start;
  return Math.max(1, clampPage(high, start, end) - start + 1);
}

function tryVibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // ignore
  }
}

function formatDateTime(iso: string, lang: "ar" | "en"): string {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

type ViewState = { scale: number; tx: number; ty: number };

/* Static wrapper: keeps each tool row's onClick lexically attached to its own
   <button> so the refs rule can verify the handler boundary (routing
   callbacks through a render-built array defeated that analysis). */
function ToolRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-3 py-3 text-right transition hover:bg-surface-soft active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-strong">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-black">{label}</span>
      <ChevronLeft size={16} className="shrink-0 text-muted rtl:rotate-180" />
    </button>
  );
}

export function MushafReaderView({
  data,
  quran,
  onBack,
  sessionSeed,
  initialMode = "ward",
}: {
  data: WardData;
  quran: QuranData;
  onBack: () => void;
  sessionSeed?: {
    source?: MushafSource;
    projectId?: string | null;
    projectName?: string | null;
    wirdId?: string | null;
  };
  initialMode?: ReaderMode;
}) {
  const { t, locale } = useLocale();
  const [page, setPage] = useState<number | null>(null);
  const [readerMode, setReaderMode] = useState<ReaderMode>(initialMode);
  const [celebration, setCelebration] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  /* Timestamp captured when the info sheet opens: elapsed time derives from
     this state (pure) instead of calling Date.now() during render. */
  const [infoOpenedAt, setInfoOpenedAt] = useState(0);
  const [wardOpen, setWardOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [indexOpen, setIndexOpen] = useState(false);
  const [indexTab, setIndexTab] = useState<"surahs" | "juz">("surahs");
  const [indexQuery, setIndexQuery] = useState("");
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reciterOpen, setReciterOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  /* Resolved once on mount — the root element also carries data-mushaf-theme.
     A saved theme wins, otherwise we default to the warm yellow parchment. */
  const [mushafTheme, setMushafTheme] = useState<MushafThemeId>(() => loadMushafTheme());
  /* Reading fit: how the page is scaled to fill the screen (persisted). */
  const [fitMode, setFitMode] = useState<MushafFitId>(() => loadMushafFit());
  /* Measured transparent-margin crop for the current page (null = uncropped). */
  const [glyph, setGlyph] = useState<GlyphBox | null>(null);
  /* Follow-along: page auto-tracks the recited ayah while audio plays. */
  const [followAudio, setFollowAudio] = useState(true);
  const pendingPlayRef = useRef(false);
  /* Immersive-first: the tools start hidden and a tap on the page toggles
     them; five idle seconds put them away again. */
  const [chrome, setChrome] = useState(false);
  const chromeTimer = useRef<number | null>(null);
  const [doneFlash, setDoneFlash] = useState(false);
  const [showResume, setShowResume] = useState(false);
  /* Snapshot of the stopped-at page for the resume card: captured once when
     the card is shown, so render never reads sessionRef (compiler-pure). */
  const [resumeLast, setResumeLast] = useState<number | null>(null);
  const [, setView] = useState<ViewState>(ZERO);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [pill, setPill] = useState<{
    key: number;
    page: number;
    done: number;
    total: number;
    fading: boolean;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [forwardNav, setForwardNav] = useState(true);
  /* Vertical page transition used by the guided down/up buttons. */
  const [flowDir, setFlowDir] = useState<null | "down" | "up">(null);
  /* Gradual walk: while non-null the arrows roll the mushaf continuously.
     The ribbon holds two fixed slots whose imgs are swapped directly in the
     interval (DOM-only) so commits stay flicker-free. */
  const [walkDir, setWalkDir] = useState<null | 1 | -1>(null);
  const [walkPair, setWalkPair] = useState<{ a: number; b: number } | null>(null);
  /* Frozen box metrics for the ribbon: captured at walk start so glyph-driven
     recomputes of `fit` (every committed page) never resize/re-render the two
     slots mid-walk. */
  const [walkFit, setWalkFit] = useState<{
    w: number;
    h: number;
    placeLeft: number;
    placeTop: number;
    imgW: number;
    imgH: number;
  } | null>(null);
  const walkRef = useRef<HTMLDivElement | null>(null);
  const walkARef = useRef<HTMLImageElement | null>(null);
  const walkBRef = useRef<HTMLImageElement | null>(null);
  /* Stops a running walk; defined early because touch/pause handlers use it. */
  const endWalk = useCallback(() => {
    setWalkDir(null);
    setWalkPair(null);
    setWalkFit(null);
    setFlowDir(null);
  }, []);
  const [imgError, setImgError] = useState(false);
  const [imgRetryKey, setImgRetryKey] = useState(0);

  // Mode determines the page range and which session/storage to use.
  // Quran mode: full mushaf (1..604), independent session + lastPage.
  // Ward mode: today's ward range (or a custom range from Ward Setup),
  // independent session + lastPage (legacy keys).
  const isQuranMode = readerMode === "quran";
  /* Optional user-defined ward range (from Ward Setup); wins over the daily
     range until the next fresh ward day. Quran mode always uses 1..604. */
  const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupFrom, setSetupFrom] = useState("");
  const [setupTo, setSetupTo] = useState("");
  const range = useMemo(() => {
    if (!isQuranMode && customRange) return customRange;
    if (isQuranMode) {
      return { start: 1, end: quran.meta ? quran.meta.pages : 604 };
    }
    return data.todayReading
      ? { start: data.todayReading.startPage, end: data.todayReading.endPage }
      : { start: data.startPage, end: data.endPage };
  }, [customRange, isQuranMode, quran.meta, data]);
  const rangeTotal = range.end - range.start + 1;
  const [session, setSession] = useState<MushafSession>(() => {
    const prev = isQuranMode ? loadQuranSession() : loadSession();
    return defaultSession({
      ...(prev ?? {}),
      source: sessionSeed?.source ?? prev?.source ?? "standalone",
      projectId: sessionSeed?.projectId ?? prev?.projectId ?? null,
      projectName: sessionSeed?.projectName ?? prev?.projectName ?? null,
      wirdId: sessionSeed?.wirdId ?? prev?.wirdId ?? null,
      startPage: range.start,
      endPage: range.end,
      totalPages: rangeTotal,
      sessionEndTime: null,
      brightness: prev?.brightness ?? 1,
      readAgain: false,
      highestPageReached: prev?.highestPageReached ?? prev?.lastReadPage ?? range.start,
autoScrollEnabled: prev?.autoScrollEnabled ?? false,
          scrollSpeed: clampValue(prev?.scrollSpeed ?? 0.15, 0.1, 1),
      completed: prev?.completed ?? false,
      updatedAt: prev?.updatedAt ?? new Date().toISOString(),
      bookmark: Number.isInteger(prev?.bookmark) ? (prev?.bookmark as number) : null,
      bookmarks: sanitizeBookmarks(prev?.bookmarks),
    });
  });
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (isQuranMode) saveQuranSession(session);
    else saveSession(session);
  }, [session, isQuranMode]);

  const patchSession = useCallback((patch: Partial<MushafSession>) => {
    setSession((s) => {
      const n = { ...s, ...patch };
      sessionRef.current = n;
      return n;
    });
  }, []);

  /* Page-based ward progress — derived from the session's monotonic highest
     page, never from a manual flip counter. Opening the ward counts page 1
     (1/25 → 4%); reaching the last page counts 25/25 → 100%. */
  const quranPct = useMemo(() => {
    if (isQuranMode && rangeTotal > 0) {
      return clampValue(
        ((Math.max(0, (page ?? range.start) - range.start + 1)) / rangeTotal) * 100,
        0,
        100,
      );
    }
    return 0;
  }, [isQuranMode, rangeTotal, range.start, page]);

  const quranProgress = isQuranMode
    ? Math.max(0, (page ?? range.start) - range.start + 1)
    : 0;

  const wardReached = isQuranMode
    ? 0
    : Math.max(
        1,
        clampPage(session.highestPageReached, range.start, range.end) - range.start + 1,
      );
  const wardPct = clampValue(rangeTotal > 0 ? (wardReached / rangeTotal) * 100 : 0, 0, 100);
  const wardDone = isQuranMode ? false : wardReached >= rangeTotal;
  const donePct = isQuranMode ? quranPct : wardPct;
  const remainingPages = Math.max(0, rangeTotal - (isQuranMode ? quranProgress : wardReached));

  const isDone = isQuranMode ? page === range.end && range.end > range.start : wardDone;
  const loading = page === null;

  const areaObsRef = useRef<ResizeObserver | null>(null);
  const areaCb = useCallback((el: HTMLDivElement | null) => {
    if (areaObsRef.current) {
      areaObsRef.current.disconnect();
      areaObsRef.current = null;
    }
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setArea((cur) =>
        cur && Math.abs(cur.w - r.width) < 1 && Math.abs(cur.h - r.height) < 1
          ? cur
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    areaObsRef.current = ro;
  }, []);

  /* Auto-scroll / speed state — persisted with the session on every change. */
  const [autoScrollOn, setAutoScrollOn] = useState<boolean>(
    () => session.autoScrollEnabled ?? false,
  );
  const [scrollSpeed, setScrollSpeed] = useState<number>(() =>
    clampValue(Number.isFinite(session.scrollSpeed) ? (session.scrollSpeed as number) : 0.15, 0.1, 1),
  );
  const [autoPaused, setAutoPaused] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);

  /* ---- Reader dialog accessibility ----
     Ten bottom sheets are rendered in this component. Each one declared
     itself to nobody: no dialog role, no accessible name, no Escape key, and
     focus was free to wander out into the page behind while a sheet was open.

     The role goes on each sheet's backdrop rather than its panel. The backdrop
     wraps the panel and nothing else, so trapping focus within it is exactly
     trapping focus within the sheet — and putting it there means only the
     opening tags change, with no closing-tag surgery in a 3,600-line file.
     Contract implemented by useDialogA11y (same as the shared Sheet). */
  const infoSheetRef = useRef<HTMLDivElement>(null);
  const wardSheetRef = useRef<HTMLDivElement>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);
  const themeSheetRef = useRef<HTMLDivElement>(null);
  const searchSheetRef = useRef<HTMLDivElement>(null);
  const jumpSheetRef = useRef<HTMLDivElement>(null);
  const indexSheetRef = useRef<HTMLDivElement>(null);
  const marksSheetRef = useRef<HTMLDivElement>(null);
  const speedSheetRef = useRef<HTMLDivElement>(null);
  const setupSheetRef = useRef<HTMLDivElement>(null);

  useDialogA11y(infoOpen, () => setInfoOpen(false), infoSheetRef);
  useDialogA11y(wardOpen, () => setWardOpen(false), wardSheetRef);
  useDialogA11y(moreOpen, () => setMoreOpen(false), moreSheetRef);
  useDialogA11y(themeOpen, () => setThemeOpen(false), themeSheetRef);
  useDialogA11y(searchOpen, () => setSearchOpen(false), searchSheetRef);
  useDialogA11y(jumpOpen, () => setJumpOpen(false), jumpSheetRef);
  useDialogA11y(indexOpen, () => setIndexOpen(false), indexSheetRef);
  useDialogA11y(bookmarksOpen, () => setBookmarksOpen(false), marksSheetRef);
  useDialogA11y(speedOpen, () => setSpeedOpen(false), speedSheetRef);
  useDialogA11y(setupOpen, () => setSetupOpen(false), setupSheetRef);

  // When switching modes, save current session to its storage and load the
  // other mode's session. Reset page state so the initial-page effect can
  // re-resolve from the freshly loaded session.
  const handleModeSwitch = useCallback(
    (next: ReaderMode) => {
      if (next === readerMode) return;
      // Save current session first (the save effect will catch it, but be explicit).
      if (readerMode === "quran") saveQuranSession(session);
      else saveSession(session);
      // Load the other mode's session.
      const prev = next === "quran" ? loadQuranSession() : loadSession();
      const targetRange =
        next === "quran"
          ? { start: 1, end: quran.meta ? quran.meta.pages : 604 }
          : data.todayReading
            ? { start: data.todayReading.startPage, end: data.todayReading.endPage }
            : { start: data.startPage, end: data.endPage };
      setSession(
        defaultSession({
          ...(prev ?? {}),
          source: sessionSeed?.source ?? prev?.source ?? "standalone",
          projectId: sessionSeed?.projectId ?? prev?.projectId ?? null,
          projectName: sessionSeed?.projectName ?? prev?.projectName ?? null,
          wirdId: sessionSeed?.wirdId ?? prev?.wirdId ?? null,
          startPage: targetRange.start,
          endPage: targetRange.end,
          totalPages: targetRange.end - targetRange.start + 1,
          sessionEndTime: null,
          brightness: prev?.brightness ?? 1,
          readAgain: false,
          highestPageReached: prev?.highestPageReached ?? prev?.lastReadPage ?? targetRange.start,
          autoScrollEnabled: prev?.autoScrollEnabled ?? false,
scrollSpeed: clampValue(prev?.scrollSpeed ?? 0.15, 0.1, 1),
          completed: false,
          updatedAt: prev?.updatedAt ?? new Date().toISOString(),
          bookmark: Number.isInteger(prev?.bookmark) ? (prev?.bookmark as number) : null,
          bookmarks: sanitizeBookmarks(prev?.bookmarks),
        }),
      );
      setReaderMode(next);
      setPage(null); // triggers the initial-page effect with the new session
      setGlyph(null);
      setResumeLast(null);
      setShowResume(false);
      setCelebration(false);
      setDoneFlash(false);
      setSpeedOpen(false);
      setSetupOpen(false);
    },
    [readerMode, session, sessionSeed, data, quran.meta],
  );

  const pageBoxRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<ViewState>(ZERO);
  const advancingRef = useRef(false);
  /* Set while the guided reading flow turns pages so the page-settle effect
     keeps the reading zoom instead of resetting to fit. */
  const skipResetRef = useRef(false);
  /* Latest rendered page, so the auto-scroll timer never reads a stale value. */
  const pageRef = useRef<number | null>(null);
  /* Set only while the auto-scroll timer turns pages programmatically. */
  const autoTickRef = useRef(false);
  const lastTapTime = useRef(0);
  const singleTimer = useRef<number | null>(null);
  const pillTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const pageImgRef = useRef<HTMLImageElement | null>(null);
  /* Per-page glyph crop cache; the caller mutates the map then bump `glyph`. */
  const [glyphCache] = useState<Map<number, GlyphBox>>(() => loadGlyphCache());

  const gest = useRef<{
    mode: "none" | "swipe" | "pan" | "pinch";
    startX: number;
    startY: number;
    moved: boolean;
    panX: number;
    panY: number;
    pinchDist: number;
    pinchScale: number;
    pinchMidX: number;
    pinchMidY: number;
    viewStart: ViewState;
  }>({
    mode: "none",
    startX: 0,
    startY: 0,
    moved: false,
    panX: 0,
    panY: 0,
    pinchDist: 0,
    pinchScale: 1,
    pinchMidX: 0,
    pinchMidY: 0,
    viewStart: { ...ZERO },
  });

  const applyViewRaw = useCallback((v: ViewState, spring: boolean) => {
    const el = pageBoxRef.current;
    if (!el) return;
    el.style.transition = spring
      ? "transform 360ms cubic-bezier(0.34,1.56,0.64,1)"
      : "none";
    el.style.transform = `translate3d(${v.tx}px, ${v.ty}px, 0) scale(${v.scale})`;
  }, []);

  const clampPan = useCallback(
    (v: ViewState): ViewState => {
      const pageBox = pageBoxRef.current;
      if (!pageBox || !area) return v;
      const iw = pageBox.offsetWidth * v.scale;
      const ih = pageBox.offsetHeight * v.scale;
      const maxX = Math.max(0, (iw - area.w) / 2);
      const maxY = Math.max(0, (ih - area.h) / 2);
      return {
        scale: Math.max(1, v.scale),
        tx: clampValue(v.tx, -maxX, maxX),
        ty: clampValue(v.ty, -maxY, maxY),
      };
    },
    [area],
  );

  const setViewState = useCallback(
    (v: ViewState, spring: boolean) => {
      const next = clampPan(v);
      viewRef.current = next;
      applyViewRaw(next, spring);
      setView(next);
    },
    [applyViewRaw, clampPan],
  );

  const resetZoom = useCallback((spring = true) => setViewState(ZERO, spring), [setViewState]);

  /* Fit/mode/page changes settle the view from event handlers (not effects)
     so the compiler never sees setState inside an effect body. */
  const switchFit = useCallback(
    (id: MushafFitId) => {
      setFitMode(id);
      saveMushafFit(id);
      resetZoom(false);
      tryVibrate(15);
    },
    [resetZoom],
  );

  /* Measure the glyph block of the current page once (cached in localStorage),
     so the verse area — not the transparent margins — fills the stage. */
  const measureGlyphRow = useCallback((pageNum: number, el: HTMLImageElement | null) => {
    if (pageNum <= 0 || !el) return;
    const pre = precomputedGlyph(pageNum);
    if (pre) {
      setGlyph(pre);
      return;
    }
    const cached = glyphCache.get(pageNum);
    if (cached) {
      setGlyph(cached);
      return;
    }
    const box = measureGlyphBox(el);
    if (box) {
      glyphCache.set(pageNum, box);
      persistGlyphCache(glyphCache);
    }
    setGlyph(box);
  }, [glyphCache]);

  /* On page/mode switches the cached crop (or none) applies instantly until
     the new img loads and re-measures. Handled in goTo/initial/mode-switch
     below — no render-sync effect needed. */

  /* Area changes after zoomed-in need the view reset to zero (defined after
     applyViewRaw so the callback is already hoisted — eslint forbids use-before-declare). */
  useEffect(() => {
    if (!area) return;
    if (viewRef.current.scale <= 1.02) return;
    const next = { ...ZERO };
    viewRef.current = next;
    applyViewRaw(next, false);
    setView(next);
  }, [area, applyViewRaw]);

  useEffect(() => {
    if (page !== null) return;
    if (!data.loaded) return;
    const s = sessionRef.current;
    const saved = isQuranMode ? loadQuranLastPage() : loadLastPage();
    const todayK = new Date().toISOString().slice(0, 10);
    const fresh =
      !isQuranMode &&
      !customRange &&
      (!s.sessionStartTime ||
        s.sessionStartTime.slice(0, 10) !== todayK ||
        s.startPage !== range.start ||
        s.endPage !== range.end);
    let target: number;
    if (fresh) {
      // New ward day (or the app's range moved): open at the start page only
      // and reset this session's page-based progress.
      target = range.start;
      setAutoPaused(false);
      patchSession({
        lastReadPage: range.start,
        highestPageReached: range.start,
        completedPages: 0,
        completed: false,
        readAgain: false,
        resumeDismissed: false,
        sessionStartTime: new Date().toISOString(),
        sessionEndTime: null,
        updatedAt: new Date().toISOString(),
      });
    } else if (s.readAgain) {
      target = s.startPage;
    } else if (s.lastReadPage > range.start && !s.resumeDismissed && !isDone) {
      // Same-day reopen mid-ward: land on the start page and offer the resume card.
      target = range.start;
      setShowResume(true);
      setResumeLast(s.lastReadPage);
    } else if (s.lastReadPage >= range.start && s.lastReadPage <= range.end) {
      target = s.lastReadPage;
    } else if (saved >= range.start && saved <= range.end) {
      target = saved;
    } else {
      target = range.start;
    }
    target = clampPage(target, range.start, range.end);
    setPage(target);
    setGlyph(precomputedGlyph(target) ?? glyphCache.get(target) ?? null);
    patchSession({ lastReadPage: target });
  }, [page, range.start, range.end, isQuranMode, isDone, patchSession, glyphCache, customRange, data.loaded]);

  useEffect(() => {
    if (page === null) return;
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    resetZoom(false);
  }, [page, resetZoom]);

  /* Keep the auto-scroll timer's page snapshot in sync. */
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const lastSavedRef = useRef(0);
  useEffect(() => {
    if (page === null) return;
    if (lastSavedRef.current === page) return;
    lastSavedRef.current = page;
    if (isQuranMode) saveQuranLastPage(page);
    else saveLastPage(page);
    patchSession({ lastReadPage: page });
  }, [page, patchSession, isQuranMode]);

  /* Page-based ward progress: when the reader lands on a page further than the
     highest reached before, bump progress by the delta once and — on the last
     page — mark the ward complete. Going backward never lowers progress. */
  useEffect(() => {
    if (page === null || isQuranMode) return;
    const s = sessionRef.current;
    const target = clampPage(page, range.start, range.end);
    const prevHigh = clampPage(
      Number.isFinite(s.highestPageReached) ? s.highestPageReached : range.start,
      range.start,
      range.end,
    );
    if (target <= prevHigh) return;
    const delta = target - prevHigh;
    data.changeProgress(delta);
    quran.markPageRead(delta);
    patchSession({
      highestPageReached: target,
      completedPages: Math.min(rangeTotal, (s.completedPages ?? 0) + delta),
      updatedAt: new Date().toISOString(),
    });
    if (target >= range.end && !sessionRef.current.completed) {
      patchSession({
        completed: true,
        sessionEndTime: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (!customRange) {
        data.completeToday();
        quran.completeWard();
      }
      window.setTimeout(() => setCelebration(true), 280);
    }
  }, [
    page,
    isQuranMode,
    range.start,
    range.end,
    rangeTotal,
    customRange,
    data,
    quran,
    patchSession,
  ]);

  const info = useMemo(
    () =>
      page === null || !quran.dataset || !quran.meta
        ? null
        : pageInfo(quran.dataset, quran.meta, page),
    [quran, page],
  );

  const wardStartInfo = useMemo(
    () =>
      quran.dataset && quran.meta ? pageInfo(quran.dataset, quran.meta, range.start) : null,
    [quran, range.start],
  );

  /* Surah index: start/end printed pages per surah (ward mode: intersecting only). */
  const surahIndex = useMemo(() => {
    const dataset = quran.dataset;
    const meta = quran.meta;
    if (!dataset || !meta) return [];
    const chapters = dataset.chapters;
    const rows = chapters.map((c, i) => {
      const gid = getGlobalId(c.id, 1, chapters);
      const start = gid !== null ? (meta.pageByAyah[gid - 1] ?? 1) : 1;
      const nextGid =
        i + 1 < chapters.length ? getGlobalId(chapters[i + 1].id, 1, chapters) : null;
      const end =
        nextGid !== null ? (meta.pageByAyah[nextGid - 1] ?? 605) - 1 : 604;
      return {
        id: c.id,
        name: c.name,
        transliteration: c.transliteration,
        count: c.ayahCount,
        start,
        end,
      };
    });
    if (isQuranMode) return rows;
    return rows.filter((r) => r.end >= range.start && r.start <= range.end);
  }, [quran.dataset, quran.meta, isQuranMode, range.start, range.end]);

  const filteredSurahs = useMemo(() => {
    const q = indexQuery.trim().toLowerCase();
    if (!q) return surahIndex;
    return surahIndex.filter(
      (r) => r.name.includes(indexQuery.trim()) || r.transliteration.toLowerCase().includes(q),
    );
  }, [surahIndex, indexQuery]);

  /* Verse search → printed page mapping for the search sheet. */
  const searchResults = useMemo(() => {
    const dataset = quran.dataset;
    const meta = quran.meta;
    const query = searchQuery.trim();
    if (!searchOpen || query.length < 2 || !dataset || !meta) return [];
    return quran
      .search(query, 30)
      .map((r) => {
        const gid = getGlobalIdOfRef(r.ref, dataset);
        const page = gid !== null ? (meta.pageByAyah[gid - 1] ?? null) : null;
        const resolved = resolveAyah(r.ref, dataset);
        return {
          ref: r.ref,
          text: r.text,
          page,
          surah: resolved?.chapter.name ?? "",
          ayah: resolved?.verse.number ?? 0,
        };
      })
      .filter((r) => r.page !== null);
  }, [searchOpen, searchQuery, quran]);

  /* Juz index: start page + opening surah per juz (ward mode: intersecting only). */
  const juzIndex = useMemo(() => {
    const dataset = quran.dataset;
    const meta = quran.meta;
    if (!dataset || !meta) return [];
    const rows: { juz: number; start: number; end: number; surah: string }[] = [];
    for (let j = 1; j <= 30; j += 1) {
      const firstIdx = meta.juzByAyah.findIndex((v) => v === j);
      if (firstIdx === -1) continue;
      const start = meta.pageByAyah[firstIdx] ?? 1;
      const nextIdx = meta.juzByAyah.findIndex((v) => v === j + 1);
      const end = nextIdx === -1 ? 604 : (meta.pageByAyah[nextIdx] ?? 605) - 1;
      const ref = refFromGlobalId(dataset, firstIdx + 1);
      const resolved = ref ? resolveAyah(ref, dataset) : null;
      rows.push({ juz: j, start, end, surah: resolved?.chapter.name ?? "" });
    }
    if (isQuranMode) return rows;
    return rows.filter((r) => r.end >= range.start && r.start <= range.end);
  }, [quran.dataset, quran.meta, isQuranMode, range.start, range.end]);

  const fit = area ? fitGlyph(area, fitMode, glyph) : null;

  const showPill = useCallback((p: number, done: number, total: number) => {
    if (pillTimer.current !== null) window.clearTimeout(pillTimer.current);
    setPill({ key: Date.now(), page: p, done, total, fading: false });
    pillTimer.current = window.setTimeout(() => {
      setPill((cur) => (cur ? { ...cur, fading: true } : cur));
      pillTimer.current = window.setTimeout(() => setPill(null), 420);
    }, PILL_SHOW_MS);
  }, []);

  const openInfo = useCallback(() => {
    setInfoOpenedAt(Date.now());
    setInfoOpen(true);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 1800);
  }, []);

  /* Error report: prefilled share text (surah • page • position), sent
     through the system share sheet, clipboard as fallback. */
  const reportPageError = useCallback(async () => {
    const where =
      page !== null && info
        ? `${info.surah} — ${t("mushaf.pageNumber", { page: toArabicIndic(info.page) })} • ${t(
            "mushaf.posLine",
            {
              j: toArabicIndic(info.juz),
              h: toArabicIndic(info.hizb),
              q: toArabicIndic(info.quarter),
            },
          )}`
        : "";
    const text = `${t("mushaf.reportIntro")}\n${where}\n${new Date().toISOString().slice(0, 10)}`;
    setMoreOpen(false);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to clipboard (user dismissed or share unavailable)
      }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    showToast(t("mushaf.reportCopied"));
  }, [page, info, t, showToast]);

  const goTo = useCallback(
    (next: number, done?: number, silent = false, flow: "down" | "up" | null = null) => {
      const clamped = clampPage(next, range.start, range.end);
      setFlowDir(flow);
      setPage(clamped);
      setGlyph(precomputedGlyph(clamped) ?? glyphCache.get(clamped) ?? null);
      setImgError(false);
      resetZoom(false);
      if (!silent) {
        showPill(
          clamped,
          done ??
            (isQuranMode
              ? clamped - range.start + 1
              : wardReachedOf(sessionRef.current, range.start, range.end)),
          rangeTotal,
        );
      }
    },
    [range.start, range.end, rangeTotal, resetZoom, showPill, isQuranMode, glyphCache],
  );

  /* Auto-scroll engine: turns one page forward at a time. Reaching the last
     page stops (the progress effect celebrates).

     The interval is derived from the page that is on screen, so a sparse page
     is not held for as long as a dense one. It is rebuilt whenever the page
     changes, which also means the dwell for the next page is computed just
     before it is shown. */
  useEffect(() => {
    if (!autoScrollOn || autoPaused || isQuranMode || celebration || page === null || isDone) return;
    /* Falls back to the flat base when the dataset or page metadata is not
       loaded, which is exactly the previous behaviour. */
    const factor =
      quran.dataset && quran.meta && page !== null
        ? pageDwellFactor(quran.dataset, quran.meta, page)
        : 1;
    const intervalMs = (AUTO_SCROLL_BASE_MS / Math.max(0.25, scrollSpeed)) * factor;
    const iv = window.setInterval(() => {
      const cur = pageRef.current;
      if (cur === null) return;
      if (cur >= range.end) {
        setAutoPaused(true);
        window.clearInterval(iv);
        return;
      }
      autoTickRef.current = true;
      goTo(cur + 1, undefined, true);
      autoTickRef.current = false;
    }, intervalMs);
    return () => window.clearInterval(iv);
  }, [
    autoScrollOn,
    autoPaused,
    isQuranMode,
    celebration,
    isDone,
    scrollSpeed,
    range.end,
    page,
    quran.dataset,
    quran.meta,
    goTo,
  ]);

  const goNextP = useCallback(() => {
    if (walkDir !== null) endWalk();
    if (page !== null && page < range.end && !advancingRef.current) goTo(page + 1);
  }, [page, range.end, goTo, walkDir, endWalk]);

  const goPrevP = useCallback(() => {
    if (walkDir !== null) endWalk();
    if (page !== null && page > range.start && !advancingRef.current) goTo(page - 1);
  }, [page, range.start, goTo, walkDir, endWalk]);

  /* Wake lock while the reader is open (best-effort). */
  useEffect(() => {
    let disposed = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request?.("screen")
      .then((wl) => {
        if (disposed) {
          wl.release().catch(() => {});
        } else {
          wakeLockRef.current = wl;
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  const toggleZoom = useCallback(() => {
    if (viewRef.current.scale > 1.05) resetZoom(true);
    else setViewState({ scale: 2.2, tx: 0, ty: 0 }, true);
  }, [resetZoom, setViewState]);

  /* ── Immersive reading ────────────────────────────────────────────────
        The Android status and navigation bars are hidden by the native
        SystemBars plugin while this reader is mounted and given back when it
        closes, so the rest of Wardi keeps its status bar. Android is allowed
        to reveal the bars transiently when the user swipes from an edge (the
        behaviour set in MainActivity); we never fight that gesture — we only
        re-assert the reader state when the app comes back to the foreground. */
  useEffect(() => {
    setImmersive(true);
    const reassert = () => {
      if (!document.hidden) setImmersive(true);
    };
    document.addEventListener("visibilitychange", reassert);
    return () => {
      document.removeEventListener("visibilitychange", reassert);
      setImmersive(false);
    };
  }, []);

  /* ── Bar heights as a reserved band ───────────────────────────────────
        The bars are overlays (they never take layout space and never move the
        page when they appear), but the page is still sized and centred inside
        the band they occupy, so a shown bar can never sit on top of a line of
        the Quran. The band is measured, not hardcoded: the footer grows when a
        recitation transport appears, and the header follows the safe area. */
  const shellRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const apply = () => {
      shell.style.setProperty(
        "--mushaf-bar-top-h",
        `${headerRef.current?.offsetHeight ?? 0}px`,
      );
      shell.style.setProperty(
        "--mushaf-bar-bot-h",
        `${footerRef.current?.offsetHeight ?? 0}px`,
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (headerRef.current) ro.observe(headerRef.current);
    if (footerRef.current) ro.observe(footerRef.current);
    return () => ro.disconnect();
  }, [celebration]);

  /* ── Transient chrome ─────────────────────────────────────────────────
        Header and footer are overlays over the page: hidden on open, revealed
        by a tap on the page, and hidden again by a second tap, by the tap on
        the page while they show, or by the five-second idle timer. Because
        they are overlays they never re-flow the page, so the reading position
        never moves. */
  const clearChromeTimer = useCallback(() => {
    if (chromeTimer.current !== null) {
      window.clearTimeout(chromeTimer.current);
      chromeTimer.current = null;
    }
  }, []);

  const showChrome = useCallback(() => {
    setChrome(true);
    clearChromeTimer();
    chromeTimer.current = window.setTimeout(() => {
      chromeTimer.current = null;
      setChrome(false);
    }, CHROME_HIDE_MS);
  }, [clearChromeTimer]);

  const hideChrome = useCallback(() => {
    clearChromeTimer();
    setChrome(false);
  }, [clearChromeTimer]);

  /* Re-arm the auto-hide without forcing chrome visible (toolbar taps). */
  const pokeChrome = useCallback(() => {
    clearChromeTimer();
    chromeTimer.current = window.setTimeout(() => {
      chromeTimer.current = null;
      setChrome(false);
    }, CHROME_HIDE_MS);
  }, [clearChromeTimer]);

  /* Leaving the reader must not leave a timer behind. */
  useEffect(() => clearChromeTimer, [clearChromeTimer]);

  /* No auto-hide while any sheet/menu is open. Opening a sheet also pauses the
     auto-scroll so pages don't turn underneath the overlay. */
  const anySheetOpen =
    infoOpen ||
    wardOpen ||
    jumpOpen ||
    indexOpen ||
    bookmarksOpen ||
    moreOpen ||
    searchOpen ||
    reciterOpen ||
    themeOpen ||
    speedOpen ||
    setupOpen;
  /* eslint-disable react-hooks/set-state-in-effect -- pause auto-scroll when a sheet opens */
  useEffect(() => {
    if (anySheetOpen) {
      if (autoScrollOn && !autoPaused && !isQuranMode) setAutoPaused(true);
      clearChromeTimer();
    } else if (chrome) {
      pokeChrome();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anySheetOpen, chrome, clearChromeTimer, pokeChrome]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* A tap on the page toggles the tools: hidden → shown, shown → hidden.
     Double tap stays reserved for zoom, page turns stay on swipes, and taps on
     the tools themselves never reach this handler (they are a separate
     overlay layer, not children of the page surface). */
  const onSingleTap = useCallback(() => {
    if (chrome) hideChrome();
    else showChrome();
  }, [chrome, hideChrome, showChrome]);

  const onDoubleTap = useCallback(() => {
    toggleZoom();
  }, [toggleZoom]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime.current < DOUBLE_TAP_MS) {
      lastTapTime.current = 0;
      if (singleTimer.current !== null) {
        window.clearTimeout(singleTimer.current);
        singleTimer.current = null;
      }
      onDoubleTap();
      return;
    }
    lastTapTime.current = now;
    singleTimer.current = window.setTimeout(() => {
      singleTimer.current = null;
      onSingleTap();
    }, DOUBLE_TAP_MS);
  }, [onDoubleTap, onSingleTap]);

  const commitView = useCallback(() => {
    const v = viewRef.current;
    const settled = v.scale <= 1.02 ? { ...ZERO } : clampPan(v);
    viewRef.current = settled;
    applyViewRaw(settled, true);
    setView(settled);
  }, [applyViewRaw, clampPan]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (celebration) return;
      // Any touch of the mushaf sheet stops a running walk.
      if (walkDir !== null) endWalk();
      // Smart pause: any touch of the mushaf sheet pauses the auto-scroll.
      if (autoScrollOn && !autoPaused && !isQuranMode) setAutoPaused(true);
      const t = e.touches;
      if (singleTimer.current !== null) {
        window.clearTimeout(singleTimer.current);
        singleTimer.current = null;
      }
      const g = gest.current;
      if (t.length === 1) {
        const x = t[0].clientX;
        const y = t[0].clientY;
        g.mode = "swipe";
        g.startX = x;
        g.startY = y;
        g.moved = false;
        g.panX = x;
        g.panY = y;
        g.viewStart = { ...viewRef.current };
      } else if (t.length === 2) {
        g.mode = "pinch";
        g.pinchDist = touchDist(t[0], t[1]);
        g.pinchScale = viewRef.current.scale;
        g.pinchMidX = (t[0].clientX + t[1].clientX) / 2;
        g.pinchMidY = (t[0].clientY + t[1].clientY) / 2;
        g.viewStart = { ...viewRef.current };
        g.moved = true;
        applyViewRaw(viewRef.current, false);
        tryVibrate(8);
      }
    },
    [celebration, applyViewRaw, autoScrollOn, autoPaused, isQuranMode, walkDir, endWalk],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (celebration) return;
      const t = e.touches;
      const g = gest.current;
      if (g.mode === "pinch" && t.length >= 2) {
        const d = touchDist(t[0], t[1]);
        if (d < 6) return;
        const mx = (t[0].clientX + t[1].clientX) / 2;
        const my = (t[0].clientY + t[1].clientY) / 2;
        const scale = clampValue(g.pinchScale * (d / g.pinchDist), 1, MAX_ZOOM);
        const v = clampPan({
          scale,
          tx: g.viewStart.tx + (mx - g.pinchMidX),
          ty: g.viewStart.ty + (my - g.pinchMidY),
        });
        applyViewRaw(v, false);
        viewRef.current = v;
        return;
      }
      if (g.mode === "swipe" || g.mode === "pan") {
        const x = t[0].clientX;
        const y = t[0].clientY;
        g.moved = true;
        if (viewRef.current.scale > 1.02) {
          g.mode = "pan";
          const v = clampPan({
            scale: viewRef.current.scale,
            tx: g.viewStart.tx + (x - g.panX),
            ty: g.viewStart.ty + (y - g.panY),
          });
          applyViewRaw(v, false);
          viewRef.current = v;
        }
      }
    },
    [celebration, clampPan, applyViewRaw],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (celebration) return;
      const g = gest.current;
      if (g.mode === "pinch") {
        if (e.touches.length === 2) return;
        if (e.touches.length === 1) {
          const x = e.touches[0].clientX;
          const y = e.touches[0].clientY;
          g.mode = "pan";
          g.panX = x;
          g.panY = y;
          g.viewStart = { ...viewRef.current };
          g.moved = true;
          return;
        }
        commitView();
        g.mode = "none";
        return;
      }
      if (g.mode === "swipe" || g.mode === "pan") {
        if (g.mode === "pan") {
          commitView();
          g.mode = "none";
          return;
        }
        g.mode = "none";
        const ch = e.changedTouches[0];
        const dx = ch.clientX - g.startX;
        const dy = ch.clientY - g.startY;
        const moved = Math.hypot(dx, dy) > TAP_SLOP_PX;
        if (moved && viewRef.current.scale <= 1.02) {
          if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < Math.abs(dx) * 1.5) {
            // RTL mushaf: pages flow leftward, so the NEXT page comes when the
            // finger swipes to the RIGHT (dx > 0). LTR is the opposite.
            // A manual swipe pauses auto-follow (re-enable from the audio bar).
            const forward = (locale === "ar") === (dx > 0);
            setForwardNav(forward);
            setFollowAudio(false);
            if (forward) goNextP();
            else goPrevP();
          }
          // Any flip attempt keeps the timer running with the new page.
          if (autoScrollOn && !isQuranMode) setAutoPaused(false);
        } else if (!moved) {
          handleTap();
        }
        applyViewRaw(ZERO, true);
        viewRef.current = { ...ZERO };
        setView({ ...ZERO });
      }
    },
    [celebration, commitView, goNextP, goPrevP, handleTap, applyViewRaw, locale, autoScrollOn, isQuranMode, setAutoPaused],
  );

  const onTouchCancel = useCallback(() => {
    const g = gest.current;
    g.mode = "none";
    g.moved = false;
    commitView();
  }, [commitView]);

  const finishPage = useCallback(() => {
    if (isQuranMode) {
      // Quran mode: just advance the page, no ward/quran-store tracking.
      if (page === null || advancingRef.current) return;
      if (walkDir !== null) endWalk();
      advancingRef.current = true;
      setDoneFlash(true);
      tryVibrate(45);
      let nextPage = page;
      if (page < range.end) nextPage = page + 1;
      const doneNext = nextPage - range.start + 1;
      patchSession({ lastReadPage: nextPage });
      window.setTimeout(() => {
        advancingRef.current = false;
        setDoneFlash(false);
        goTo(nextPage, doneNext);
      }, ADVANCE_MS);
      window.setTimeout(() => {
        showToast(t("mushaf.quranCompleteMsg"));
      }, ADVANCE_MS);
      return;
    }

    // Ward mode: page-based. The check button advances one printed page (or
    // finalizes when already on the last page). Progress syncs automatically
    // from the actual page reached — no manual counters here.
    if (page === null || advancingRef.current) return;
    if (walkDir !== null) endWalk();
    advancingRef.current = true;
    setDoneFlash(true);
    tryVibrate(45);

    const reached = clampPage(page, range.start, range.end);
    if (reached >= range.end) {
      // Already on the final page: finalize the ward once.
      const curReached = wardReachedOf(sessionRef.current, range.start, range.end);
      const delta = Math.max(0, rangeTotal - curReached);
      if (delta > 0) {
        data.changeProgress(delta);
        quran.markPageRead(delta);
      }
      const wasDone = sessionRef.current.completed;
      patchSession({
        completedPages: rangeTotal,
        highestPageReached: range.end,
        completed: true,
        sessionEndTime: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (!wasDone && !customRange) {
        data.completeToday();
        quran.completeWard();
      }
      window.setTimeout(() => {
        advancingRef.current = false;
        setDoneFlash(false);
        setCelebration(true);
      }, ADVANCE_MS);
      return;
    }

    const next = reached + 1;
    patchSession({ lastReadPage: next });
    window.setTimeout(() => {
      advancingRef.current = false;
      setDoneFlash(false);
      goTo(next);
    }, ADVANCE_MS);
  }, [
    page,
    data,
    quran,
    patchSession,
    goTo,
    isQuranMode,
    range.end,
    range.start,
    rangeTotal,
    customRange,
    t,
    showToast,
    walkDir,
    endWalk,
  ]);

  const resumeContinue = useCallback(() => {
    setShowResume(false);
    const target = clampPage(sessionRef.current.lastReadPage, range.start, range.end);
    patchSession({ resumeDismissed: true });
    goTo(target);
  }, [range.start, range.end, patchSession, goTo]);

  const resumeStartOver = useCallback(() => {
    setShowResume(false);
    patchSession({ resumeDismissed: true, readAgain: false });
    goTo(range.start);
  }, [range.start, patchSession, goTo]);

  const readAgain = useCallback(() => {
    setAutoPaused(true);
    setCelebration(false);
    patchSession({
      readAgain: true,
      resumeDismissed: false,
      lastReadPage: range.start,
      highestPageReached: range.start,
      completedPages: 0,
      completed: false,
      sessionStartTime: new Date().toISOString(),
      sessionEndTime: null,
      updatedAt: new Date().toISOString(),
    });
    goTo(range.start);
  }, [range.start, patchSession, goTo]);

  /* ── Auto-scroll controls ─────────────────────────────────────── */
  const toggleAuto = useCallback(() => {
    if (!autoScrollOn) {
      setAutoScrollOn(true);
      setAutoPaused(false);
      patchSession({ autoScrollEnabled: true });
    } else if (autoPaused) {
      setAutoPaused(false);
    } else {
      setAutoPaused(true);
    }
  }, [autoScrollOn, autoPaused, patchSession]);

  const setSpeed = useCallback((v: number) => {
    const s = clampValue(Number.isFinite(v) ? v : 1, 0.1, 1);
    setScrollSpeed(s);
    patchSession({ scrollSpeed: s });
  }, [patchSession]);

  /* ── Guided reading flow ─────────────────────────────────────────
     The down/up buttons always do something visible: while zoomed in they pan
     through the page, otherwise (the crisp full-screen crop has little room
     to scroll) they turn the page with a smooth vertical slide. */
  const flowAdvance = useCallback(
    (dir: 1 | -1) => {
      // Keep the current reading zoom but re-anchor to the page's top/bottom.
      const scale = viewRef.current.scale;
      const next = clampPage(page === null ? range.start : page + dir, range.start, range.end);
      if (next === page) return;
      skipResetRef.current = true;
      setFlowDir(dir === 1 ? "down" : "up");
      setPage(next);
      setGlyph(precomputedGlyph(next) ?? glyphCache.get(next) ?? null);
      setImgError(false);
      window.setTimeout(() => {
        const el = pageBoxRef.current;
        const ih = (el ? el.offsetHeight : (fit?.h ?? area?.h ?? 0)) * scale;
        const maxY = Math.max(0, (ih - (area?.h ?? 0)) / 2);
        setViewState({ scale, tx: 0, ty: dir === 1 ? -maxY : maxY }, false);
      }, 60);
    },
    [page, range.start, range.end, glyphCache, fit, area, setViewState],
  );

  /* ── Gradual walking descent/ascend ─────────────────────────────
     While reading in the fit view, the down/up arrows don't flip pages:
     they start a continuous walk — the ribbon slides page-by-page at the
     chosen speed, committing each page silently (session bookkeeping) so
     progress stays correct. Tapping again on the same arrow, tapping the
     sheet, or any other navigation stops the walk on the current page. */
  const startWalk = useCallback(
    (dir: 1 | -1) => {
      if (page === null || !area || !fit) return;
      if (walkDir === dir) {
        endWalk();
        return;
      }
      if (dir === 1 && page >= range.end) {
        showToast(t("mushaf.flowEnd"));
        return;
      }
      if (dir === -1 && page <= range.start) {
        showToast(t("mushaf.flowStart"));
        return;
      }
      // First plain press on a direction starts the walk. Changing direction
      // while walking remounts the ribbon (keyed below) with new slot pages.
      setWalkFit({ w: fit.w, h: fit.h, placeLeft: fit.placeLeft, placeTop: fit.placeTop, imgW: fit.imgW, imgH: fit.imgH });
      setWalkPair(dir === 1 ? { a: page, b: page + 1 } : { a: page - 1, b: page });
      setWalkDir(dir);
    },
    [page, area, fit, walkDir, range.end, range.start, showToast, t, endWalk],
  );

  /* The walk ticker: slides the ribbon by one small step every tick. Each time
     the ribbon has shifted a full page it commits that page (silent goTo for
     session/progress) and advances the two slot imgs imperatively — in the
     same frame as the transform wrap — so commits are seamless. */
  useEffect(() => {
    if (walkDir === null || !area || !walkFit) return;
    const holder = walkRef.current;
    if (!holder) return;
    const dir = walkDir;
    let offset = 0;
    const ah = walkFit.h;
    const step = (ah / WALK_STEPS_PER_PAGE) * Math.max(0.1, scrollSpeed);
    const iv = window.setInterval(() => {
      offset += step;
      if (offset >= ah) {
        const curP = pageRef.current;
        if (dir === 1) {
          if (curP === null || curP >= range.end) {
            endWalk();
            showToast(t("mushaf.flowEnd"));
            return;
          }
          const nxt = curP + 1;
          if (walkARef.current) walkARef.current.src = `/quran/pages/${nxt}.webp`;
          if (walkBRef.current)
            walkBRef.current.src = `/quran/pages/${Math.min(nxt + 1, range.end)}.webp`;
          goTo(nxt, undefined, true);
        } else {
          if (curP === null || curP <= range.start) {
            endWalk();
            showToast(t("mushaf.flowEnd"));
            return;
          }
          const nxt = curP - 1;
          if (walkBRef.current) walkBRef.current.src = `/quran/pages/${nxt}.webp`;
          if (walkARef.current)
            walkARef.current.src = `/quran/pages/${Math.max(nxt - 1, range.start)}.webp`;
          goTo(nxt, undefined, true);
        }
        offset -= ah;
      }
      holder.style.transform = `translate3d(0, ${dir === 1 ? -offset : offset}px, 0)`;
    }, WALK_STEP_MS);
    return () => window.clearInterval(iv);
  }, [walkDir, area, walkFit, scrollSpeed, range.end, range.start, showToast, t, goTo, endWalk]);

  const flowDown = useCallback(() => {
    if (page === null || !area) return;
    // Keep the auto timer running while flipping manually: the walk advances
    // one page now, the timer keeps turning the rest of the ward.
    if (viewRef.current.scale > 1.1) {
      flowAdvance(1);
      return;
    }
    startWalk(1);
  }, [page, area, flowAdvance, startWalk]);

  const flowUp = useCallback(() => {
    if (page === null || !area) return;
    if (viewRef.current.scale > 1.1) {
      flowAdvance(-1);
      return;
    }
    startWalk(-1);
  }, [page, area, flowAdvance, startWalk]);

  /* ── Custom ward range (Ward Setup) ───────────────────────────── */
  const applyWardSetup = useCallback(() => {
    const metaPages = quran.meta?.pages ?? 604;
    const from = Math.max(1, Math.min(metaPages, Number.parseInt(setupFrom, 10) || range.start));
    const to = Math.max(from + 1, Math.min(metaPages, Number.parseInt(setupTo, 10) || range.end));
    const start = from;
    const end = Math.max(start + 1, to);
    setCustomRange({ start, end });
    setAutoPaused(true);
    setSetupOpen(false);
    setCelebration(false);
    patchSession({
      startPage: start,
      endPage: end,
      totalPages: end - start + 1,
      lastReadPage: start,
      highestPageReached: start,
      completedPages: 0,
      completed: false,
      readAgain: false,
      resumeDismissed: false,
      sessionEndTime: null,
      updatedAt: new Date().toISOString(),
    });
    goTo(start);
    showToast(t("mushaf.wardSetupApplied"));
  }, [
    setupFrom,
    setupTo,
    range.start,
    range.end,
    quran.meta,
    patchSession,
    goTo,
    showToast,
    t,
  ]);

  const saveBookmark = useCallback(() => {
    if (page === null) return;
    const list = [page, ...(sessionRef.current.bookmarks ?? []).filter((b) => b !== page)].slice(
      0,
      20,
    );
    patchSession({ bookmark: page, bookmarks: list });
    showToast(t(isQuranMode ? "mushaf.quranBookmarkSaved" : "mushaf.savedPage"));
    tryVibrate(25);
  }, [page, patchSession, showToast, t, isQuranMode]);

  const switchTheme = useCallback(
    (id: MushafThemeId) => {
      setMushafTheme(id);
      saveMushafTheme(id);
      showToast(t("mushaf.themeChanged"));
      tryVibrate(20);
    },
    [showToast, t],
  );

  const removeBookmark = useCallback(
    (b: number) => {
      const list = (sessionRef.current.bookmarks ?? []).filter((x) => x !== b);
      patchSession({
        bookmarks: list,
        bookmark:
          sessionRef.current.bookmark === b ? (list[0] ?? null) : sessionRef.current.bookmark,
      });
      showToast(t("mushaf.bookmarkRemoved"));
      tryVibrate(15);
    },
    [patchSession, showToast, t],
  );

  const bookmarkRows = useMemo(() => {
    const dataset = quran.dataset;
    const meta = quran.meta;
    if (!dataset || !meta) return [];
    return (session.bookmarks ?? []).map((b) => ({
      page: b,
      info: pageInfo(dataset, meta, clampPage(b, 1, 604)),
    }));
  }, [session.bookmarks, quran.dataset, quran.meta]);

  /* Session elapsed time label, derived from the open-timestamp snapshot. */
  const elapsedLabel = useMemo(() => {
    if (!infoOpen || !infoOpenedAt) return "";
    const ms = Math.max(0, infoOpenedAt - new Date(session.sessionStartTime).getTime());
    if (!Number.isFinite(ms)) return "";
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    return h > 0
      ? t("mushaf.duration", { h: toArabicIndic(h), m: toArabicIndic(m % 60) })
      : t("mushaf.minutes", { m: toArabicIndic(Math.max(m, 1)) });
  }, [infoOpen, infoOpenedAt, session.sessionStartTime, t]);

  const jumpTo = useCallback(
    (raw: string) => {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) {
        setJumpOpen(false);
        goTo(n);
      }
    },
    [goTo],
  );

  /* ── Page recitation (streams the current page from the saved reciter) ── */
  const audio = useAudioPlayer();

  /* Autoplay once the requested track is ready (set by handleListen). */
  useEffect(() => {
    if (audio.error) {
      pendingPlayRef.current = false;
      return;
    }
    if (pendingPlayRef.current && audio.currentTrack) {
      pendingPlayRef.current = false;
      audio.actions.play();
    }
  }, [audio.error, audio.currentTrack, audio.actions]);

  /* Pending listen request waiting for a reciter to be picked. */
  const pendingListenRef = useRef<{ surah: number; ayah: number } | null>(null);
  useEffect(() => {
    const p = pendingListenRef.current;
    if (p && audio.currentReciter) {
      pendingListenRef.current = null;
      pendingPlayRef.current = true;
      void audio.actions.loadSurah(p.surah, p.ayah);
    }
  }, [audio.currentReciter, audio.actions]);

  /* Jump to the printed page of the currently recited ayah (follow along). */
  const followReciting = useCallback(() => {
    if (
      !quran.dataset ||
      !quran.meta ||
      !audio.currentSurah ||
      audio.currentTrack?.ayah === undefined
    )
      return;
    setFollowAudio(true);
    const gid = getGlobalId(
      audio.currentSurah.number,
      audio.currentTrack.ayah,
      quran.dataset.chapters,
    );
    if (gid === null) return;
    const p = quran.meta.pageByAyah[gid - 1];
    if (p !== undefined) goTo(p);
  }, [quran.dataset, quran.meta, audio.currentSurah, audio.currentTrack, goTo]);

  /* Auto-follow: whenever the recited ayah advances to another printed page
     while audio plays, turn the page automatically (unless the user paused
     following with a manual swipe or the toggle). */
  const recitedKey = audio.currentSurah
    ? `${audio.currentSurah.number}:${audio.currentTrack?.ayah ?? ""}`
    : "";
  useEffect(() => {
    if (!followAudio) return;
    if (!audio.player.isPlaying) return;
    if (!quran.dataset || !quran.meta || !audio.currentSurah) return;
    const ayah = audio.currentTrack?.ayah;
    if (ayah === undefined || ayah === null) return;
    const gid = getGlobalId(audio.currentSurah.number, ayah, quran.dataset.chapters);
    if (gid === null) return;
    const p = quran.meta.pageByAyah[gid - 1];
    if (p === undefined || p === page) return;
    // Deferred a frame: lets the highlight paint first and keeps the page
    // turn out of the synchronous effect body.
    const raf = requestAnimationFrame(() => goTo(p));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recitedKey, followAudio, audio.player.isPlaying]);

  const handleListen = useCallback(async () => {
    if (!quran.dataset || !quran.meta || page === null) return;
    const first = pageAyahs(quran.dataset, quran.meta, page)[0];
    if (!first) return;
    if (!audio.currentReciter) {
      pendingListenRef.current = { surah: first.chapterId, ayah: first.verseNumber };
      setReciterOpen(true);
      return;
    }
    if (
      audio.currentSurah?.number === first.chapterId &&
      audio.currentTrack?.ayah === first.verseNumber
    ) {
      audio.actions.play();
      return;
    }
    pendingPlayRef.current = true;
    await audio.actions.loadSurah(first.chapterId, first.verseNumber);
  }, [quran.dataset, quran.meta, page, audio]);

  /* Verse-level navigation inside the running surah: stay on the same page,
     jump the queue to the adjacent ayah and play from there. */
  const skipVerse = useCallback(
    (delta: number) => {
      if (!quran.dataset || !audio.currentSurah || audio.currentTrack?.ayah === undefined) return;
      const cap = audio.currentSurah.ayahCount;
      const next = Math.min(Math.max(1, audio.currentTrack.ayah + delta), cap);
      if (next === audio.currentTrack.ayah) return;
      pendingPlayRef.current = true;
      void audio.actions.loadSurah(audio.currentSurah.number, next);
    },
    [audio, quran.dataset],
  );

  const durationMs = useMemo(() => {
    if (!session.sessionEndTime) return 0;
    return Math.max(
      0,
      new Date(session.sessionEndTime).getTime() - new Date(session.sessionStartTime).getTime(),
    );
  }, [session.sessionStartTime, session.sessionEndTime]);

  const canPrev = page !== null && page > range.start;
  const canNext = page !== null && page < range.end;

  const preload = (p: number) => `/quran/pages/${clampPage(p, 1, 604)}.webp`;

  /* Stopped-at page for the resume card (snapshot state — render-pure). */
  const resumePage = clampPage(resumeLast ?? range.start, range.start, range.end);

  return (
    <div
      ref={shellRef}
      className="mushaf-reader fixed inset-x-0 top-0 flex h-[var(--mushaf-h)] w-full flex-col overflow-hidden overscroll-contain text-ink"
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-mushaf-theme={mushafTheme}
      /* The shell owns the whole viewport: the page area fills all of it and
         the tools float above it, so revealing or hiding them can never
         re-flow the page or move the reading spot. `100dvh` (with a `100vh`
         fallback in CSS) keeps the layout correct when Android's system bars
         come and go. */
      style={{ transition: "background 0.28s ease" }}
    >
      {/* ── READER HEADER (overlay) ──────────────────────────────────────
          Floats over the page and only exists while the tools are shown: a tap
          on the page (or five idle seconds) takes it away again. It is not in
          the layout flow, so the page never shrinks behind it. */}
      <header
        ref={headerRef}
        className={`mushaf-bar mushaf-bar-top mushaf-bar-overlay absolute inset-x-0 top-0 z-30`}
        style={{ paddingTop: "max(0.5rem, var(--mushaf-safe-top))" }}
      >
        {/* TOOLS ROW — fades away with the rest of the chrome, but keeps its
            height so showing or hiding it never shifts the page. */}
        <div
          aria-hidden={!chrome}
          inert={!chrome}
          className={`flex items-center gap-1.5 px-3 pb-1 transition-[opacity,transform] duration-200 ease-out ${
            chrome
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-2 opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label={t("ui.back")}
            className="mushaf-bar-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          >
            <ArrowLeft size={18} className="rtl:rotate-180" />
          </button>

          <span className="flex-1" />

          <button
            type="button"
            onClick={() =>
              page !== null &&
              (session.bookmark === page ? removeBookmark(page) : saveBookmark())
            }
            aria-label={t("mushaf.bookmark")}
            data-active={session.bookmark === page}
            className="mushaf-bar-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          >
            <Bookmark
              key={String(session.bookmark === page)}
              size={18}
              className="animate-scale-in"
              fill={session.bookmark === page ? "currentColor" : "none"}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              setThemeOpen(true);
            }}
            aria-label={t("mushaf.appearance")}
            title={t("mushaf.appearance")}
            className="mushaf-bar-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          >
            <Palette size={18} />
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSearchOpen(true);
            }}
            aria-label={t("mushaf.searchTitle")}
            className="mushaf-bar-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          >
            <Search size={18} />
          </button>
        </div>

        {/* FIXED POSITION CARD — always on screen while reading: surah name,
            juz, hizb and a small live progress ring on one line, with the
            page number beneath. Tapping opens the full page-info sheet. */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={openInfo}
            aria-label={t(isQuranMode ? "mushaf.quranPageInfo" : "mushaf.info")}
            className="mushaf-pos-card relative flex w-full flex-col items-center overflow-hidden rounded-2xl px-3 py-1.5 text-center transition active:scale-[0.995]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
              style={{
                background:
                  "radial-gradient(120% 150% at 50% -30%, color-mix(in oklab, var(--mgold) 18%, transparent), transparent 70%)",
              }}
            />
            <span className="relative flex w-full min-w-0 items-center justify-center gap-2">
              <span
                className="max-w-[46%] truncate font-quran text-[15px] font-bold leading-tight"
                style={{ color: "var(--mgold-strong)" }}
              >
                {info?.surah ?? t(isQuranMode ? "mushaf.quranMode" : "mushaf.title")}
              </span>
              {info && (
                <>
                  <span
                    aria-hidden
                    className="h-3.5 w-px shrink-0"
                    style={{ background: "color-mix(in oklab, var(--mgold) 34%, transparent)" }}
                  />
                  <span
                    className="min-w-0 truncate text-[11px] font-bold leading-none"
                    style={{ color: "var(--mmuted)" }}
                  >
                    {t("mushaf.posShort", {
                      j: toArabicIndic(info.juz),
                      h: toArabicIndic(info.hizb),
                    })}
                  </span>
                </>
              )}
              <span className="flex shrink-0 items-center gap-1" aria-hidden>
                <ProgressRing
                  percent={donePct}
                  size={24}
                  stroke={3}
                  track="color-mix(in oklab, var(--mgold-strong) 30%, transparent)"
                />
                <span
                  className="text-[9.5px] font-black leading-none tabular-nums"
                  style={{ color: "var(--mgold-strong)" }}
                >
                  {toArabicIndic(Math.round(donePct))}
                  {t("mushaf.percent")}
                </span>
              </span>
            </span>
            <span className="relative mt-1 flex items-center justify-center">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-[1.5px] text-[11px] font-black leading-tight tabular-nums"
                style={{
                  color: "var(--mgold-strong)",
                  background: "color-mix(in oklab, var(--mgold-strong) 12%, transparent)",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in oklab, var(--mgold-strong) 24%, transparent)",
                }}
              >
                {page !== null && info
                  ? t("mushaf.pageNumber", { page: toArabicIndic(info.page) })
                  : t("mushaf.wardOf", {
                      from: toArabicIndic(range.start),
                      to: toArabicIndic(range.end),
                      done: toArabicIndic(isQuranMode ? quranProgress : wardReached),
                      total: toArabicIndic(rangeTotal),
                    })}
              </span>
            </span>
          </button>
        </div>
      </header>

      {/* PAGE AREA — the whole screen: the paper is centred in all of it and
          the tools float on top, so the reading position never depends on
          whether they are showing. */}
      <main
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain"
        style={{
          paddingTop: "var(--mushaf-bar-top-h, 0px)",
          paddingBottom: "var(--mushaf-bar-bot-h, 0px)",
        }}
      >
        {loading ? (
          <div className="mushaf-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div
              className="h-1/2 w-[70%] animate-pulse rounded-[6px]"
              style={{ background: "rgba(74,56,18,0.10)" }}
              aria-hidden
            />
          </div>
        ) : (
          <div
            ref={areaCb}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
            className="mushaf-stage relative flex min-h-0 min-w-0 flex-1 touch-none items-center justify-center overflow-hidden"
          >
            {canPrev && (
              <img
                src={preload(page - 1)}
                alt=""
                draggable={false}
                aria-hidden
                className="pointer-events-none absolute h-px w-px opacity-0"
              />
            )}
            {canNext && (
              <img
                src={preload(page + 1)}
                alt=""
                draggable={false}
                aria-hidden
                className="pointer-events-none absolute h-px w-px opacity-0"
              />
            )}

            {walkDir === null ? (
            <div
              key={page}
              ref={pageBoxRef}
              className={`${
                flowDir === "down"
                  ? "animate-page-rise"
                  : flowDir === "up"
                    ? "animate-page-drop"
                    : forwardNav === (locale === "ar")
                      ? "animate-page-in-rev"
                      : "animate-page-in"
              } pointer-events-none relative overflow-hidden`}
              style={{
                ...(fit
                  ? {
                      width: fit.w,
                      height: fit.h,
                    }
                  : {
                      // Fallback only the first moment before `area` is measured.
                      width: "min(100vw, 62dvh)",
                      aspectRatio: "1024 / 1656",
                      maxHeight: "100%",
                    }),
                willChange: "transform",
              }}
            >
              {imgError ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
                  <p className="text-sm font-black text-[#5a4a28]">
                    {t("mushaf.pageLoadError")}
                  </p>
                  <p className="text-xs font-bold text-[#5a4a28]/70">
                    {t("mushaf.pageNumber", { page: toArabicIndic(page) })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setImgError(false);
                      setImgRetryKey((k) => k + 1);
                    }}
                    className="mt-1 flex h-11 items-center gap-2 rounded-2xl bg-gold px-6 text-sm font-black text-primary-deep transition active:scale-[0.98]"
                  >
                    {t("quran.retry")}
                  </button>
                </div>
              ) : (
                <img
                  key={imgRetryKey}
                  ref={pageImgRef}
                  onLoad={(e) => {
                    measureGlyphRow(page, e.currentTarget);
                    applyViewRaw(viewRef.current, false);
                  }}
                  onError={() => setImgError(true)}
                  src={`/quran/pages/${page}.webp`}
                  alt=""
                  draggable={false}
                  decoding="async"
                  fetchPriority="high"
                  className="mushaf-glyphs pointer-events-none select-none"
                  style={
                    fit
                      ? {
                          position: "absolute",
                          left: fit.placeLeft,
                          top: fit.placeTop,
                          width: fit.imgW,
                          height: fit.imgH,
                          maxWidth: "none",
                          maxHeight: "none",
                        }
                      : { maxWidth: "100%", maxHeight: "100%" }
                  }
                />
              )}
            </div>
            ) : walkFit && area ? (
              /* Gradual-walk ribbon: two fixed slots whose imgs swap in sync
                 with the ticker (see walk effect). Slides over the whole
                 stage exactly like a filled page. */
              <div
                className="pointer-events-none absolute inset-0 z-[2]"
                style={{ width: area.w, height: area.h }}
                aria-hidden
              >
                <div
                  ref={walkRef}
                  className="absolute top-0"
                  style={{
                    left: (area.w - walkFit.w) / 2,
                    transform: "translate3d(0,0,0)",
                    width: walkFit.w,
                    height: walkFit.h,
                    willChange: "transform",
                  }}
                >
                  {!(walkDir === -1) ? (
                    <>
                      <div className="absolute left-0" style={{ top: 0, width: walkFit.w, height: walkFit.h }}>
                        <WalkPage
                          src={walkPair?.a ?? 1}
                          boxW={walkFit.w}
                          boxH={walkFit.h}
                          placeLeft={walkFit.placeLeft}
                          placeTop={walkFit.placeTop}
                          imgW={walkFit.imgW}
                          imgH={walkFit.imgH}
                          imgRef={walkARef}
                        />
                      </div>
                      <div className="absolute left-0" style={{ top: walkFit.h, width: walkFit.w, height: walkFit.h }}>
                        <WalkPage
                          src={walkPair?.b ?? 1}
                          boxW={walkFit.w}
                          boxH={walkFit.h}
                          placeLeft={walkFit.placeLeft}
                          placeTop={walkFit.placeTop}
                          imgW={walkFit.imgW}
                          imgH={walkFit.imgH}
                          imgRef={walkBRef}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="absolute left-0" style={{ top: -walkFit.h, width: walkFit.w, height: walkFit.h }}>
                        <WalkPage
                          src={walkPair?.a ?? 1}
                          boxW={walkFit.w}
                          boxH={walkFit.h}
                          placeLeft={walkFit.placeLeft}
                          placeTop={walkFit.placeTop}
                          imgW={walkFit.imgW}
                          imgH={walkFit.imgH}
                          imgRef={walkARef}
                        />
                      </div>
                      <div className="absolute left-0" style={{ top: 0, width: walkFit.w, height: walkFit.h }}>
                        <WalkPage
                          src={walkPair?.b ?? 1}
                          boxW={walkFit.w}
                          boxH={walkFit.h}
                          placeLeft={walkFit.placeLeft}
                          placeTop={walkFit.placeTop}
                          imgW={walkFit.imgW}
                          imgH={walkFit.imgH}
                          imgRef={walkBRef}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* page-done flash */}
        {doneFlash && !celebration && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
            <div className="animate-check-pop flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-black text-primary-deep shadow-[0_18px_44px_-16px_rgba(177,138,62,0.8)]">
              <Check size={18} strokeWidth={3.5} />
              {t("mushaf.pageDone")}
            </div>
          </div>
        )}
        {doneFlash && !celebration && (
          <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 text-gold">
            <Check size={30} strokeWidth={3} className="animate-float-up" />
          </div>
        )}

        {/* transient page pill — only while the tools are away, otherwise the
            footer already shows the page and the progress */}
        {pill && !chrome && !celebration && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center">
            <span
              key={pill.key}
              className={`mushaf-chrome-bar rounded-full px-4 py-1.5 text-xs font-black transition-opacity duration-400 ${
                pill.fading ? "opacity-0" : "opacity-100"
              }`}
              style={{ color: "var(--mgold-strong)" }}
            >
              {t("mushaf.pageNumber", { page: toArabicIndic(pill.page) })}
              <span className="mx-1.5 opacity-45">•</span>
              <span className="num-ltr whitespace-nowrap">
                {toArabicIndic(pill.done)}/{toArabicIndic(pill.total)}
              </span>
            </span>
          </div>
        )}

        {/* bookmark toast */}
        {toastMsg && !celebration && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
            <span className="animate-fade-in flex items-center rounded-full bg-gold px-4 py-1.5 text-xs font-black text-primary-deep shadow-lg">
              <Bookmark size={11} className="ml-1 inline rtl:mr-1" strokeWidth={3} />
              {toastMsg}
            </span>
          </div>
        )}

        {/* auto-scroll + guided-reading controls live in the footer now, so
            nothing floats over the mushaf text while reading. */}

        {/* page recitation state lives in the audio engine + tap-revealed
            toolbar only — nothing floats over the mushaf text while reading. */}
        <ReciterSheet open={reciterOpen} onClose={() => setReciterOpen(false)} />

        {/* resume card */}
        {showResume && !celebration && page !== null && info && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0c1f17]/70 p-4 backdrop-blur-[2px]">
            <div className="animate-scale-in-soft w-full max-w-xs rounded-3xl border border-gold/40 bg-surface p-5 text-center shadow-2xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong">
                {isQuranMode ? <Library size={24} /> : <BookOpen size={24} />}
              </div>
              {isQuranMode ? (
                <>
                  <p className="mt-3 text-lg font-black">{t("mushaf.quranResumeTitle")}</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    {t("mushaf.quranStoppedAt")}{" "}
                    <span className="font-black text-ink">
                      {toArabicIndic(resumePage)}
                    </span>
                  </p>
                  {info && (
                    <p className="mt-0.5 text-xs font-bold text-gold-strong">
                      {t("mushaf.surah", { name: info.surah })} •{" "}
                      {t("mushaf.nowReading", {
                        name: info.surah,
                        page: toArabicIndic(resumePage),
                      })}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs font-bold text-gold-strong">
                    {t("mushaf.quranResumePages", {
                      done: toArabicIndic(Math.max(0, resumePage - range.start)),
                      total: toArabicIndic(rangeTotal),
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-lg font-black">{t("mushaf.resumeTitle")}</p>
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    {t("mushaf.stoppedAt")}{" "}
                    <span className="font-black text-ink">
                      {t("mushaf.surah", { name: info.surah })}
                    </span>{" "}
                    •{" "}
                    {t("mushaf.pageNumber", {
                      page: toArabicIndic(resumePage),
                    })}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-gold-strong">
                    {t("mushaf.wardShort", {
                      done: toArabicIndic(wardReached),
                      total: toArabicIndic(rangeTotal),
                    })}
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={resumeContinue}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-[0_16px_40px_-16px_rgba(177,138,62,0.7)] transition active:scale-[0.98]"
              >
                {t(isQuranMode ? "mushaf.quranResume" : "mushaf.resume")}
              </button>
              <button
                type="button"
                onClick={resumeStartOver}
                className="mt-2.5 h-11 w-full rounded-2xl bg-surface text-sm font-black text-muted ring-1 ring-line transition active:scale-[0.98]"
              >
                {t(isQuranMode ? "mushaf.quranStartOver" : "mushaf.startOver")}
              </button>
            </div>
          </div>
        )}

        {/* completion screen — covers the whole reader, bars included, so the
            moment of finishing reads as one screen and not a card floating
            between two toolbars. */}
        {celebration && (
          <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#0c1f17]/92 p-4 backdrop-blur-[2px]">
            <div className="animate-scale-in-soft w-full max-w-sm rounded-3xl border border-gold/40 bg-surface p-6 text-center shadow-2xl">
              <div className="mx-auto flex flex-col items-center">
                <ProgressRing
                  percent={100}
                  size={92}
                  stroke={8}
                  track="rgba(202,168,100,0.2)"
                  bar={GOLD}
                  animated
                  label={() => (
                    <span className="text-[10px] font-black text-gold-strong">100%</span>
                  )}
                />
              </div>
              <p className="mt-4 text-xl font-black">{t("mushaf.completionTitle")}</p>
              <p className="mt-1 text-xs font-bold text-muted">{t("mushaf.completionSub")}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-4 py-1.5 text-xs font-black text-gold-strong">
                <Check size={14} strokeWidth={3.5} />
                {t("mushaf.compPages", { total: toArabicIndic(rangeTotal) })}
              </div>

              <div className="mt-5 space-y-2.5 rounded-2xl bg-surface-soft p-3.5 text-left">
                {session.projectName && (
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-muted">{t("mushaf.compProject")}</span>
                    <span className="font-black text-ink">{session.projectName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 text-xs font-bold">
                  <span className="text-muted">{t("mushaf.compStart")}</span>
                  <span className="font-black text-ink">
                    {formatDateTime(session.sessionStartTime, locale)}
                  </span>
                </div>
                {session.sessionEndTime && (
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-muted">{t("mushaf.compTime")}</span>
                    <span className="font-black text-ink">
                      {formatDateTime(session.sessionEndTime, locale)}
                    </span>
                  </div>
                )}
                {durationMs > 0 && (
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-muted">{t("mushaf.compDuration")}</span>
                    <span className="font-black text-ink">
                      {t("mushaf.duration", {
                        h: toArabicIndic(Math.floor(durationMs / 3600000)),
                        m: toArabicIndic(Math.max(1, Math.round((durationMs % 3600000) / 60000))),
                      })}
                    </span>
                  </div>
                )}
              </div>

              {!customRange && (
                <p className="mt-4 rounded-xl bg-success-soft px-3 py-2.5 text-xs font-bold text-success">
                  {t("mushaf.tomorrow", {
                    from: toArabicIndic(data.tomorrowStart),
                    to: toArabicIndic(data.tomorrowEnd),
                    n: toArabicIndic(data.tomorrowPages),
                  })}
                </p>
              )}

              <button
                type="button"
                onClick={onBack}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-[0_16px_40px_-16px_rgba(177,138,62,0.7)] transition active:scale-[0.98]"
              >
                {t("mushaf.finishWard")}
              </button>
              <button
                type="button"
                onClick={readAgain}
                className="mt-2.5 h-11 w-full rounded-2xl bg-surface text-sm font-black text-muted ring-1 ring-line transition active:scale-[0.98]"
              >
                {t("mushaf.readAgain")}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── READER FOOTER (overlay) ──────────────────────────────────────
          Also an overlay: the page keeps the full height and the tools fade
          over it, so hiding them never reflows the mushaf and the last lines
          of a page are never squeezed or moved. */}
      {!celebration && (
        <footer
          ref={footerRef}
          aria-hidden={!chrome}
          inert={!chrome}
          className={`mushaf-bar mushaf-bar-bottom mushaf-bar-overlay absolute inset-x-0 bottom-0 z-30 transition-[opacity,transform] duration-200 ease-out ${
            chrome
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-3 opacity-0"
          }`}
          style={{ paddingBottom: "max(0.5rem, var(--mushaf-safe-bottom))" }}
        >
          {/* RECITATION TRANSPORT — only while a recitation is loaded. It
              lives in the footer now instead of floating over the page, so it
              can never cover a line of the Quran. */}
          {audio.currentTrack && !isDone && (
            <div className="mx-3 mt-2 flex h-11 items-center gap-1 rounded-2xl border border-[color-mix(in_oklab,var(--mgold)_26%,transparent)] px-1.5">
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  skipVerse(-1);
                }}
                aria-label={t("mushaf.prevAyah")}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                <ChevronLeft size={16} className="rtl:rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  if (audio.player.isPlaying) audio.actions.pause();
                  else audio.actions.play();
                }}
                aria-label={t(audio.player.isPlaying ? "mushaf.listenPause" : "mushaf.listenPlay")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--mgold)", color: "#2b2312" }}
              >
                {audio.player.isPlaying ? (
                  <Pause size={15} />
                ) : (
                  <Play size={15} className="rtl:-scale-x-100" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  skipVerse(1);
                }}
                aria-label={t("mushaf.nextAyah")}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                <ChevronRight size={16} className="rtl:rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  audio.actions.stop();
                }}
                aria-label={t("mushaf.stopRecite")}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                <Square size={13} />
              </button>
              <span
                className="min-w-0 flex-1 truncate px-1 text-center text-[11px] font-black tabular-nums"
                style={{ color: "var(--mgold-strong)" }}
              >
                {audio.currentSurah && audio.currentTrack?.ayah !== undefined
                  ? t("mushaf.listenNow", {
                      name: audio.currentSurah.name,
                      ayah: toArabicIndic(audio.currentTrack.ayah),
                    })
                  : t("mushaf.listenLoading")}
              </span>
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  if (followAudio) setFollowAudio(false);
                  else followReciting();
                }}
                aria-label={t("mushaf.followAudio")}
                title={t("mushaf.followAudio")}
                data-active={followAudio}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                <LocateFixed size={14} />
              </button>
            </div>
          )}

          {/* GUIDED READING — the auto-scroll and page-flow controls. They
              live in the footer (never over the page) and the row keeps a
              fixed height, so pausing the auto-scroll does not resize the
              page area and make the mushaf jump. */}
          {!isQuranMode && !isDone && page !== null && (
            <div className="flex h-11 items-center justify-center gap-1.5 px-3 pt-1.5">
              {autoScrollOn && autoPaused && (
                <button
                  type="button"
                  onClick={() => {
                    pokeChrome();
                    toggleAuto();
                  }}
                  aria-label={t("mushaf.autoResume")}
                  className="mushaf-bar-btn flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-black"
                >
                  <Play size={12} className="rtl:rotate-180" fill="currentColor" />
                  {t("mushaf.autoResume")}
                </button>
              )}
              {autoScrollOn && (
                <button
                  type="button"
                  onClick={() => {
                    pokeChrome();
                    setSpeedOpen(true);
                  }}
                  aria-label={t("mushaf.autoScrollSpeed")}
                  className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                >
                  <SlidersHorizontal size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  toggleAuto();
                }}
                aria-label={
                  autoScrollOn && !autoPaused ? t("mushaf.autoPause") : t("mushaf.autoPlay")
                }
                data-active={autoScrollOn && !autoPaused}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                {autoScrollOn && !autoPaused ? (
                  <Pause size={15} fill="currentColor" />
                ) : (
                  <Play size={15} className="rtl:rotate-180" fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  flowUp();
                }}
                aria-label={t("mushaf.flowUp")}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                <ChevronUp size={17} />
              </button>
              <button
                type="button"
                onClick={() => {
                  pokeChrome();
                  flowDown();
                }}
                aria-label={t("mushaf.flowDown")}
                className="mushaf-bar-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              >
                <ChevronDown size={17} />
              </button>
            </div>
          )}

          {/* PROGRESS + WARD RANGE — the reading progress of the current
              mode, and the way into the ward sheet that explains it. */}
          <div className="flex items-center gap-2.5 px-3 pt-2">
            <button
              type="button"
              onClick={() => setWardOpen(true)}
              aria-label={t("mushaf.wardA11y")}
              className="mushaf-bar-btn shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black"
            >
              {isQuranMode
                ? t("mushaf.quranMode")
                : t("mushaf.wardOf", {
                    from: toArabicIndic(range.start),
                    to: toArabicIndic(range.end),
                  })}
            </button>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(donePct)}
              aria-label={t(isQuranMode ? "mushaf.quranProgress" : "mushaf.wardProgress")}
              className="mushaf-bar-track h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
            >
              <div
                className="mushaf-bar-fill h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${donePct}%` }}
              />
            </div>
            <span
              className="num-ltr shrink-0 whitespace-nowrap text-[12px] font-black tabular-nums"
              style={{ color: "var(--mmuted)" }}
            >
              {toArabicIndic(Math.round(donePct))}%
            </span>
          </div>

          {/* TRANSPORT — finish the page, walk the pages, listen, more tools.
              The page number in the middle opens the jump sheet. */}
          <div className="flex items-center gap-1 px-3 pb-1 pt-2">
            {isDone ? (
              <div
                className="flex flex-1 items-center justify-center gap-2 py-1 text-xs font-black"
                style={{ color: "var(--mgold-strong)" }}
              >
                <BookOpen size={15} />
                {t("mushaf.doneToday")}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={finishPage}
                  disabled={doneFlash}
                  aria-label={t(doneFlash ? "mushaf.pageDone" : "mushaf.finishPage")}
                  className="mushaf-bar-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-70"
                  style={{ background: "var(--mgold)", color: "#2b2312" }}
                >
                  <Check size={19} strokeWidth={3.5} />
                </button>
                <button
                  type="button"
                  onClick={goPrevP}
                  aria-label={t("mushaf.prev")}
                  className="mushaf-bar-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-30"
                  disabled={!canPrev}
                >
                  <ChevronLeft size={19} className="rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJumpValue(String(page ?? range.start));
                    setJumpOpen(true);
                  }}
                  aria-label={t(isQuranMode ? "mushaf.quranJumpTitle" : "mushaf.jumpTitle")}
                  className="min-w-0 flex-1 rounded-2xl py-1 text-center transition active:scale-[0.98]"
                >
                  <span
                    className="num-ltr block text-base font-black leading-none tabular-nums"
                    style={{ color: "var(--mink)" }}
                  >
                    {toArabicIndic(page ?? range.start)}
                  </span>
                  <span
                    className="num-ltr mt-1 block text-[9px] font-bold leading-none tabular-nums"
                    style={{ color: "var(--mmuted)" }}
                  >
                    / {toArabicIndic(quran.meta?.pages ?? 604)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={goNextP}
                  aria-label={t("mushaf.next")}
                  className="mushaf-bar-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-30"
                  disabled={!canNext}
                >
                  <ChevronRight size={19} className="rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleListen()}
                  aria-label={t("mushaf.listen")}
                  data-active={!!audio.currentTrack}
                  className="mushaf-bar-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                >
                  {audio.player.isPlaying ? <Pause size={18} /> : <Headphones size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  aria-label={t("mushaf.moreTools")}
                  className="mushaf-bar-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                >
                  <MoreHorizontal size={19} />
                </button>
              </>
            )}
          </div>
        </footer>
      )}

      {/* PAGE INFO SHEET */}
      {infoOpen && page !== null && info && (
        <div
          ref={infoSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.pageInfoA11y")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong">
                  <BookOpen size={18} />
                </div>
                <div>
                  <p className="text-base font-black">{t("mushaf.surah", { name: info.surah })}</p>
                  <p className="mt-0.5 text-xs font-bold text-muted">
                    {t("mushaf.pageAyahs", {
                      from: toArabicIndic(info.ayahFrom),
                      to: toArabicIndic(info.ayahTo),
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-soft px-4 py-3">
              <p className="text-xs font-black text-ink">
                {t("mushaf.pageNumber", { page: toArabicIndic(info.page) })}
              </p>
              <p className="text-xs font-black text-gold-strong">
                {t("mushaf.posLine", {
                  j: toArabicIndic(info.juz),
                  h: toArabicIndic(info.hizb),
                  q: toArabicIndic(info.quarter),
                })}
              </p>
            </div>

            {isQuranMode ? (
              <div className="mt-3 rounded-2xl bg-surface-soft p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-muted">{t("mushaf.quranProgress")}</p>
                  <p className="text-xs font-black text-gold-strong">
                    {t("mushaf.quranProgressOf", {
                      done: toArabicIndic(quranProgress),
                      total: toArabicIndic(rangeTotal),
                    })}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line/50">
                  <div
                    className="progress-animated-bar h-full rounded-full"
                    style={{
                      width: `${quranPct}%`,
                      background: `linear-gradient(90deg, ${GOLD}, #d9b96f)`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-surface-soft p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-muted">{t("mushaf.wardProgress")}</p>
                  <p className="text-xs font-black text-gold-strong">
                    {t("mushaf.ofPages", {
                      done: toArabicIndic(wardReached),
                      total: toArabicIndic(rangeTotal),
                    })}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line/50">
                  <div
                    className="progress-animated-bar h-full rounded-full"
                    style={{
                      width: `${donePct}%`,
                      background: `linear-gradient(90deg, ${GOLD}, #d9b96f)`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className={`mt-3 grid gap-2.5 ${isQuranMode ? "grid-cols-1" : "grid-cols-2"}`}>
              <div className="rounded-2xl bg-surface-soft p-3 text-center">
                <p className="text-xs font-bold text-muted">{t("mushaf.sessionTime")}</p>
                <p className="mt-1 text-[12px] font-black text-ink">{elapsedLabel}</p>
              </div>
              {!isQuranMode && (
                <div className="rounded-2xl bg-surface-soft p-3 text-center">
                  <p className="text-xs font-bold text-muted">{t("mushaf.streakLabel")}</p>
                  <p className="mt-1 text-[12px] font-black text-gold-strong">
                    {t("mushaf.streakDays", { n: toArabicIndic(data.streak) })}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={saveBookmark}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-surface text-xs font-black text-gold-strong ring-1 ring-gold/40 transition active:scale-[0.98]"
            >
              <Bookmark size={14} strokeWidth={2.6} />
              {t("mushaf.bookmark")}
            </button>
          </div>
        </div>
      )}

      {/* WARD INFO SHEET / QURAN MODE INFO SHEET */}
      {wardOpen && wardStartInfo && (
        <div
          ref={wardSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.wardA11y")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setWardOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">
                  {isQuranMode ? t("mushaf.fullMushaf") : t("mushaf.wardInfo")}
                </p>
                <p className="mt-0.5 text-xs font-bold text-muted">
                  {t("mushaf.surah", { name: wardStartInfo.surah })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWardOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {isQuranMode ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-black text-ink">
                {t("mushaf.quranProgressOf", {
                  done: toArabicIndic(quranProgress),
                  total: toArabicIndic(rangeTotal),
                })}
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-gold-soft px-4 py-3 text-sm font-black text-gold-strong">
                {t("mushaf.wardOf", {
                  from: toArabicIndic(range.start),
                  to: toArabicIndic(range.end),
                })}
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-surface-soft p-3 text-center">
                <p className="text-xs font-bold text-muted">
                  {isQuranMode ? t("mushaf.quranProgress") : t("mushaf.wardProgress")}
                </p>
                <p className="mt-1 text-[12px] font-black text-ink">
                  {isQuranMode
                    ? `${toArabicIndic(quranProgress)} / ${toArabicIndic(rangeTotal)}`
                    : `${toArabicIndic(wardReached)} / ${toArabicIndic(rangeTotal)}`}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-soft p-3 text-center">
                <p className="text-xs font-bold text-muted">
                  {isQuranMode ? t("mushaf.remainingPages") : t("mushaf.remainingPages")}
                </p>
                <p className="mt-1 text-[12px] font-black text-ink">
                  {toArabicIndic(isQuranMode ? Math.max(0, rangeTotal - quranProgress) : remainingPages)}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-soft p-3 text-center">
                <p className="text-xs font-bold text-muted">
                  {page !== null && page < range.end
                    ? t("mushaf.nextPageShort")
                    : t("mushaf.currentPageShort")}
                </p>
                <p className="mt-1 text-[12px] font-black text-ink">
                  {toArabicIndic(
                    page !== null && page < range.end ? page + 1 : page ?? range.start,
                  )}
                </p>
              </div>
            </div>

            {isQuranMode ? null : session.projectName || session.wirdId ? (
              <div className="mt-3 rounded-2xl bg-surface-soft p-3.5">
                {session.projectName && (
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-muted">{t("mushaf.compProject")}</span>
                    <span className="font-black text-ink">{session.projectName}</span>
                  </div>
                )}
                {session.wirdId && (
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-muted">Wird</span>
                    <span className="font-black text-ink">{session.wirdId}</span>
                  </div>
                )}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setWardOpen(false);
                const target =
                  sessionRef.current.lastReadPage >= range.start
                    ? clampPage(sessionRef.current.lastReadPage, range.start, range.end)
                    : page ?? range.start;
                goTo(target);
              }}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-[0_16px_40px_-16px_rgba(177,138,62,0.7)] transition active:scale-[0.98]"
            >
              <ArrowLeft size={16} className="rotate-180 rtl:rotate-0" />
              {t(isQuranMode ? "mushaf.continueReading" : "mushaf.continueReading")}
            </button>
          </div>
        </div>
      )}

      {/* MORE TOOLS SHEET */}
      {moreOpen && (
        <div
          ref={moreSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.moreTools")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-black">{t("mushaf.moreTools")}</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <SegmentedControl
                value={readerMode}
                onChange={(m) => {
                  setMoreOpen(false);
                  handleModeSwitch(m);
                }}
                aria-label={t("mushaf.modeSwitch")}
              />
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <ToolRow
                icon={<Headphones size={17} />}
                label={
                  audio.currentReciter
                    ? t("mushaf.reciterNow", { name: audio.currentReciter.name })
                    : t("mushaf.pickReciter")
                }
                onClick={() => {
                  setMoreOpen(false);
                  setReciterOpen(true);
                }}
              />
              <ToolRow
                icon={<Flag size={17} />}
                label={t("mushaf.reportError")}
                onClick={() => {
                  void reportPageError();
                }}
              />
              <ToolRow
                icon={<List size={17} />}
                label={t("mushaf.toolIndex")}
                onClick={() => {
                  setMoreOpen(false);
                  setIndexQuery("");
                  setIndexOpen(true);
                }}
              />
              <ToolRow
                icon={<Bookmark size={17} />}
                label={t(isQuranMode ? "mushaf.quranLastBookmark" : "mushaf.lastBookmark")}
                onClick={() => {
                  setMoreOpen(false);
                  setBookmarksOpen(true);
                }}
              />
              <ToolRow
                icon={<Info size={17} />}
                label={t(isQuranMode ? "mushaf.quranPageInfo" : "mushaf.info")}
                onClick={() => {
                  setMoreOpen(false);
                  openInfo();
                }}
              />
              <ToolRow
                icon={<Palette size={17} />}
                label={t("mushaf.appearance")}
                onClick={() => {
                  setMoreOpen(false);
                  setThemeOpen(true);
                }}
              />
              {!isQuranMode && (
                <>
                  <ToolRow
                    icon={<BookOpen size={17} />}
                    label={t("mushaf.wardInfo")}
                    onClick={() => {
                      setMoreOpen(false);
                      setWardOpen(true);
                    }}
                  />
                  <ToolRow
                    icon={<SlidersHorizontal size={17} />}
                    label={t("mushaf.wardSetup")}
                    onClick={() => {
                      setMoreOpen(false);
                      setSetupFrom(String(customRange?.start ?? range.start));
                      setSetupTo(String(customRange?.end ?? range.end));
                      setSetupOpen(true);
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* APPEARANCE / THEME SHEET */}
      {themeOpen && (
        <div
          ref={themeSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.appearance")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setThemeOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{t("mushaf.appearance")}</p>
                <p className="mt-0.5 text-xs font-bold text-muted">{t("mushaf.appearanceHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setThemeOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {MUSHAF_THEMES.map((th) => {
                const active = mushafTheme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => switchTheme(th.id)}
                    aria-pressed={active}
                    className={`relative flex flex-col items-stretch overflow-hidden rounded-2xl border text-right transition active:scale-[0.98] ${
                      active ? "border-gold ring-2 ring-gold/50" : "border-line"
                    }`}
                  >
                    {/* swatch preview — a mini page on the theme backdrop */}
                    <div
                      className="flex h-16 items-center justify-center"
                      style={{
                        background:
                          th.id === "dark"
                            ? "radial-gradient(120% 90% at 50% 0%, #1a1918 0%, #080807 100%)"
                            : "radial-gradient(120% 90% at 50% 0%, #3a3522 0%, #16140e 100%)",
                      }}
                    >
                      <div
                        className="h-10 w-7 rounded-sm"
                        style={{
                          background:
                            th.id === "dark"
                              ? "linear-gradient(180deg, #24201c, #181512)"
                              : "linear-gradient(180deg,#f3e3b3,#ecd9a7)",
                          boxShadow: "0 6px 14px -6px rgba(0,0,0,0.6)",
                        }}
                      >
                        <div
                          className="mx-1.5 mt-2.5 h-0.5 w-1/2 rounded-full"
                          style={{
                            background: th.id === "dark" ? "#e8cf93" : "#5a4a28",
                            opacity: 0.55,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-black">
                        {t(`mushaf.theme_${th.id}`)}
                      </span>
                      {active && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold text-[10px] font-black text-primary-deep">
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* reading fit modes — how the page fills the screen */}
            <p className="mt-6 text-sm font-black">{t("mushaf.fitMode")}</p>
            <p className="mb-3 mt-0.5 text-xs font-bold text-muted">{t("mushaf.fitModeHint")}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {MUSHAF_FITS.map((id) => {
                const activeFit = fitMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => switchFit(id)}
                    aria-pressed={activeFit}
                    className={`flex items-center justify-center rounded-2xl border px-0.5 py-2.5 text-[11px] font-black leading-tight transition active:scale-[0.97] ${
                      activeFit
                        ? "border-gold bg-gold text-primary-deep shadow-sm"
                        : "border-line bg-surface text-muted"
                    }`}
                  >
                    {t(`mushaf.fit_${id}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SEARCH SHEET */}
      {searchOpen && (
        <div
          ref={searchSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.searchTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="animate-sheet-up flex max-h-[82dvh] w-full max-w-3xl flex-col rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{t("mushaf.searchTitle")}</p>
                <p className="mt-0.5 text-xs font-bold text-muted">{t("mushaf.searchHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("mushaf.searchHint")}
              className="mt-4 h-12 w-full rounded-2xl border border-line bg-surface-soft px-4 text-sm font-bold text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-gold/60"
            />

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
              {searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-muted">
                  {t("mushaf.searchEmpty")}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {searchResults.map((r) => (
                    <button
                      key={r.ref}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        if (r.page !== null) goTo(r.page);
                      }}
                      className="rounded-2xl px-3 py-2.5 text-right transition hover:bg-surface-soft active:scale-[0.99]"
                    >
                      <span className="block truncate font-quran text-base leading-snug">
                        {r.text}
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-bold text-muted">
                          {t("mushaf.surah", { name: r.surah })} •{" "}
                          {t("mushaf.searchAyah", { n: toArabicIndic(r.ayah) })}
                        </span>
                        {r.page !== null && (
                          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-gold-strong">
                            {t("mushaf.indexPage", { p: toArabicIndic(r.page) })}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* JUMP TO PAGE SHEET */}
      {jumpOpen && (
        <div
          ref={jumpSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.jumpA11y")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setJumpOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <p className="text-center text-base font-black">
              {t(isQuranMode ? "mushaf.quranJumpTitle" : "mushaf.jumpTitle")}
            </p>
            <p className="mt-1 text-center text-xs font-bold text-muted">
              {t(isQuranMode ? "mushaf.quranJumpHint" : "mushaf.jumpHint", {
                from: toArabicIndic(range.start),
                to: toArabicIndic(range.end),
              })}
            </p>

            <input
              autoFocus
              type="number"
              inputMode="numeric"
              dir="ltr"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") jumpTo(jumpValue);
              }}
              placeholder={String(page ?? range.start)}
              className="mt-5 h-16 w-full rounded-2xl border border-gold/50 bg-surface-soft text-center text-2xl font-black text-ink outline-none transition focus:ring-2 focus:ring-gold/60"
            />

            <button
              type="button"
              onClick={() => jumpTo(jumpValue)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-[0_16px_40px_-16px_rgba(177,138,62,0.7)] transition active:scale-[0.97]"
            >
              {t(isQuranMode ? "mushaf.quranJumpBtn" : "mushaf.jumpBtn")}
            </button>
          </div>
        </div>
      )}

      {/* MUSHAF INDEX SHEET (surahs + juz) */}
      {indexOpen && quran.dataset && quran.meta && (
        <div
          ref={indexSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.indexTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setIndexOpen(false)}
        >
          <div
            className="animate-sheet-up flex max-h-[82dvh] w-full max-w-3xl flex-col rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{t("mushaf.indexTitle")}</p>
                {!isQuranMode && (
                  <p className="mt-0.5 text-xs font-bold text-muted">
                    {t("mushaf.indexWardHint")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIndexOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-surface-soft p-1.5">
              {(["surahs", "juz"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setIndexTab(tab)}
                  className={`h-10 rounded-xl text-xs font-black transition active:scale-[0.98] ${
                    indexTab === tab
                      ? "bg-gold text-primary-deep shadow-[0_10px_28px_-14px_rgba(177,138,62,0.8)]"
                      : "text-muted"
                  }`}
                >
                  {t(tab === "surahs" ? "mushaf.indexSurahs" : "mushaf.indexJuz")}
                </button>
              ))}
            </div>

            {indexTab === "surahs" && (
              <input
                value={indexQuery}
                onChange={(e) => setIndexQuery(e.target.value)}
                placeholder={t("mushaf.indexSearch")}
                className="mt-3 h-12 w-full rounded-2xl border border-line bg-surface-soft px-4 text-sm font-bold text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-gold/60"
              />
            )}

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
              {indexTab === "surahs" ? (
                filteredSurahs.length === 0 ? (
                  <p className="py-10 text-center text-sm font-bold text-muted">
                    {t("mushaf.indexEmpty")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {filteredSurahs.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setIndexOpen(false);
                          goTo(r.start);
                        }}
                        className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-right transition hover:bg-surface-soft active:scale-[0.99]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-xs font-black text-gold-strong">
                          {toArabicIndic(r.id)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-quran text-base leading-snug">
                            {r.name}
                          </span>
                          <span className="block truncate text-[11px] font-bold text-muted">
                            {r.transliteration} ÷ {toArabicIndic(r.count)}{" "}
                            {t("quran.ayahMany")}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-gold-strong">
                          {t("mushaf.indexPage", { p: toArabicIndic(r.start) })}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-1.5">
                  {juzIndex.map((r) => (
                    <button
                      key={r.juz}
                      type="button"
                      onClick={() => {
                        setIndexOpen(false);
                        goTo(r.start);
                      }}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-right transition hover:bg-surface-soft active:scale-[0.99]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-xs font-black text-gold-strong">
                        {toArabicIndic(r.juz)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">
                          {t("mushaf.indexJuzOf", { n: toArabicIndic(r.juz) })}
                        </span>
                        {r.surah && (
                          <span className="block truncate text-[11px] font-bold text-muted">
                            {t("mushaf.indexStartsWith", { name: r.surah })}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-gold-strong">
                        {t("mushaf.indexPage", { p: toArabicIndic(r.start) })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BOOKMARKS SHEET */}
      {bookmarksOpen && (
        <div
          ref={marksSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.bookmarksTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setBookmarksOpen(false)}
        >
          <div
            className="animate-sheet-up flex max-h-[70dvh] w-full max-w-3xl flex-col rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{t("mushaf.bookmarksTitle")}</p>
                <p className="mt-0.5 text-xs font-bold text-muted">
                  {t("mushaf.bookmarksCount", { n: toArabicIndic(bookmarkRows.length) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBookmarksOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
              {bookmarkRows.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-muted">
                  {t("mushaf.bookmarksEmpty")}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {bookmarkRows.map((r) => (
                    <div
                      key={r.page}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-surface-soft"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setBookmarksOpen(false);
                          goTo(r.page);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-right"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-strong">
                          <Bookmark size={15} fill="currentColor" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black">
                            {t("mushaf.pageNumber", { page: toArabicIndic(r.page) })}
                          </span>
                          {r.info && (
                            <span className="block truncate text-[11px] font-bold text-muted">
                              {t("mushaf.surah", { name: r.info.surah })}
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBookmark(r.page)}
                        aria-label={t("mushaf.bookmarkRemove")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted ring-1 ring-line transition active:scale-95"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUTO-SCROLL SPEED SHEET */}
      {speedOpen && (
        <div
          ref={speedSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.speedTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setSpeedOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{t("mushaf.speedTitle")}</p>
                <p className="mt-0.5 text-xs font-bold text-muted">{t("mushaf.speedHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSpeedOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {AUTO_SPEEDS.map((s) => {
                const active = Math.abs(scrollSpeed - s) < 0.01;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSpeed(s)}
                    className={`flex h-10 flex-1 items-center justify-center rounded-xl text-xs font-black transition active:scale-95 ${
                      active
                        ? "bg-gold text-primary-deep shadow-[0_12px_28px_-12px_rgba(177,138,62,0.7)]"
                        : "bg-surface text-muted ring-1 ring-line"
                    }`}
                  >
                    {toArabicIndic(s)}×
                  </button>
                );
              })}
            </div>

            <div className="mt-4" dir="ltr">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={scrollSpeed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label={t("mushaf.speedTitle")}
                className="w-full accent-[#d9a441]"
              />
              <div className="mt-1 flex justify-between text-[10px] font-bold text-muted">
                <span>0.1×</span>
                <span>1×</span>
              </div>
            </div>

            <p className="mt-3 rounded-2xl bg-surface-soft px-4 py-3 text-[11px] font-bold leading-relaxed text-muted">
              {t("mushaf.speedNote")}
            </p>
          </div>
        </div>
      )}

      {/* WARD SETUP SHEET — custom page range for today's ward */}
      {setupOpen && (
        <div
          ref={setupSheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("mushaf.wardSetupTitle")}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={() => setSetupOpen(false)}
        >
          <div
            className="animate-sheet-up w-full max-w-3xl rounded-t-3xl border-t border-line/70 bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{t("mushaf.wardSetupTitle")}</p>
                <p className="mt-0.5 text-xs font-bold text-muted">{t("mushaf.wardSetupHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSetupOpen(false)}
                aria-label={t("ui.close")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted ring-1 ring-line transition active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <label className="flex-1" dir={locale === "ar" ? "rtl" : "ltr"}>
                <span className="block text-xs font-black text-muted">{t("mushaf.wardFrom")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={quran.meta?.pages ?? 604}
                  value={setupFrom}
                  onChange={(e) => setSetupFrom(e.target.value)}
                  placeholder={String(range.start)}
                  className="mt-1.5 h-12 w-full rounded-2xl bg-surface-soft px-4 text-center text-sm font-black text-ink focus:ring-2 focus:ring-gold focus:outline-none"
                />
              </label>
              <span className="-mt-4 text-sm font-black text-muted">→</span>
              <label className="flex-1" dir={locale === "ar" ? "rtl" : "ltr"}>
                <span className="block text-xs font-black text-muted">{t("mushaf.wardTo")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={quran.meta?.pages ?? 604}
                  value={setupTo}
                  onChange={(e) => setSetupTo(e.target.value)}
                  placeholder={String(range.end)}
                  className="mt-1.5 h-12 w-full rounded-2xl bg-surface-soft px-4 text-center text-sm font-black text-ink focus:ring-2 focus:ring-gold focus:outline-none"
                />
              </label>
            </div>

            <p className="mt-3 text-[11px] font-bold text-muted">
              {t("mushaf.wardPages", {
                n: toArabicIndic(
                  Math.max(
                    1,
                    Math.min(quran.meta?.pages ?? 604, Number.parseInt(setupTo, 10) || range.end) -
                      Math.max(1, Number.parseInt(setupFrom, 10) || range.start) +
                      1,
                  ),
                ),
              })}
            </p>

            <div className="mt-4 flex gap-2.5">
              {customRange && (
                <button
                  type="button"
                  onClick={() => setSetupOpen(false)}
                  className="h-12 flex-1 rounded-2xl bg-surface text-sm font-black text-muted ring-1 ring-line transition active:scale-[0.98]"
                >
                  {t("ui.cancel")}
                </button>
              )}
              <button
                type="button"
                onClick={applyWardSetup}
                className="h-12 flex-1 rounded-2xl bg-gold text-sm font-black text-primary-deep shadow-[0_14px_32px_-14px_rgba(177,138,62,0.7)] transition active:scale-[0.98]"
              >
                {t("mushaf.wardStart")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
