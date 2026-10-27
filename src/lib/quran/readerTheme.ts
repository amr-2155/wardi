"use client";

export type MushafThemeId = "ivory" | "yellow" | "white" | "sepia" | "dark" | "midnight";

/** Reading fit: how the page fills the screen (see globals.css .mushaf-stage). */
export type MushafFitId = "page" | "full" | "width" | "cozy" | "auto";

export const THEME_KEY = "ward:v2:mushaf:theme";

export interface MushafTheme {
  id: MushafThemeId;
  /** Default paper/page tone (used for the loading skeleton). */
  page: string;
}

export const MUSHAF_THEMES: MushafTheme[] = [
  { id: "ivory", page: "#f7f0dc" },
  { id: "yellow", page: "#f3e3b3" },
  { id: "white", page: "#ffffff" },
  { id: "sepia", page: "#eee1c6" },
  { id: "dark", page: "#24201c" },
  { id: "midnight", page: "#000000" },
];

export const DEFAULT_MUSHAF_THEME: MushafThemeId = "yellow";

export function loadMushafTheme(): MushafThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return DEFAULT_MUSHAF_THEME;
    const id = JSON.parse(raw) as MushafThemeId;
    return MUSHAF_THEMES.some((t) => t.id === id) ? id : DEFAULT_MUSHAF_THEME;
  } catch {
    return DEFAULT_MUSHAF_THEME;
  }
}

export function saveMushafTheme(id: MushafThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(id));
  } catch {
    /* ignore */
  }
}

export const FIT_KEY = "ward:v2:mushaf:fit";

export const MUSHAF_FITS: MushafFitId[] = ["page", "full", "width", "cozy", "auto"];

/* The stage between the pinned bars must show the whole page with its edges
   intact (a printed mushaf, not a cropped screenshot), so the default fit is
   "page". "full" stays available in the appearance sheet for edge-to-edge
   immersive reading, and a stored choice is never rewritten. */
export const DEFAULT_MUSHAF_FIT: MushafFitId = "page";

export function loadMushafFit(): MushafFitId {
  try {
    const raw = localStorage.getItem(FIT_KEY);
    if (!raw) return DEFAULT_MUSHAF_FIT;
    const id = JSON.parse(raw) as MushafFitId;
    return MUSHAF_FITS.includes(id) ? id : DEFAULT_MUSHAF_FIT;
  } catch {
    return DEFAULT_MUSHAF_FIT;
  }
}

export function saveMushafFit(id: MushafFitId): void {
  try {
    localStorage.setItem(FIT_KEY, JSON.stringify(id));
  } catch {
    /* ignore */
  }
}