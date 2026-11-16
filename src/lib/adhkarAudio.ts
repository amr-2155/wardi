/**
 * Listening to the adhkar.
 *
 * Two honest kinds of audio, both real recordings by a named reciter — never a
 * synthesized voice:
 *
 * - Quran cards carry `audio` verse references. Their words are played from the
 *   real per-ayah recordings of the Quran.com CDN, recited by the reciter the
 *   reader picked. Because the reference is the verse the card was written
 *   from, the recording matches the text word for word — it is not a generic
 *   file and it is never another sheikh's voice.
 * - Hadith cards carry `hisnId`, the dhikr's id in Hisn al-Muslim, whose
 *   per-dhikr recording is read by the reciter credited inside the file's own
 *   tags (see `@/lib/audio/hisnmuslim`). The id was attached only after the
 *   recording's words were matched to the card's; where the recording says
 *   more or follows the book's wording, the card says so through `audioNote`.
 *
 * A card with neither reference has no verified recording. It is not playable:
 * the UI hides the control, and nothing here falls back to a machine voice.
 *
 * One module-level <audio> element plays everything, so two recitations can
 * never overlap, and the screen subscribes through `useSyncExternalStore` so
 * the list and the recite page always show the same player state.
 */

import { useSyncExternalStore } from "react";
import type { DhikrAyahRef, DhikrItem } from "@/data/adhkar";
import { hisnAudioUrl } from "@/lib/audio/hisnmuslim";
import { getReciterInfo, quranComProvider } from "@/lib/audio/quran-com";
import type { AudioTrackQueue } from "@/lib/audio/types";
import type { Locale } from "@/lib/locale";
import { isOnline } from "@/lib/net/connectivity";

/* ------------------------------------------------------------------ */
/* Reciters                                                            */
/* ------------------------------------------------------------------ */

/**
 * The reciters offered here are exactly the Quran.com ids we have verified to
 * serve a per-ayah file for every verse the adhkar reference. All five are
 * well-known murattal recitations; no name is added to this list unless its
 * recordings really exist. They apply to the Quran cards only: the hadith
 * recordings come from Hisn al-Muslim, whose reciter is fixed.
 */
export const ADHKAR_RECITER_IDS = ["7", "3", "4", "9", "5"] as const;

export type AdhkarReciterId = (typeof ADHKAR_RECITER_IDS)[number];

export const DEFAULT_ADHKAR_RECITER: AdhkarReciterId = "7";

const RECITER_KEY = "ward:v2:adhkar-reciter:v1";

export type AdhkarReciterOption = { id: AdhkarReciterId; name: string };

/** The stored choice, falling back to a reciter we know exists. */
export function loadAdhkarReciter(): AdhkarReciterId {
  try {
    const raw = localStorage.getItem(RECITER_KEY);
    if (raw && (ADHKAR_RECITER_IDS as readonly string[]).includes(raw)) {
      return raw as AdhkarReciterId;
    }
  } catch {
    /* Private mode: keep the default for this session. */
  }
  return DEFAULT_ADHKAR_RECITER;
}

export function saveAdhkarReciter(id: string): void {
  if (!(ADHKAR_RECITER_IDS as readonly string[]).includes(id)) return;
  try {
    localStorage.setItem(RECITER_KEY, id);
  } catch {
    /* The choice simply will not survive a restart. */
  }
}

/** Display names in the reader's language, from the one reciter table. */
export function adhkarReciters(locale: Locale): AdhkarReciterOption[] {
  return ADHKAR_RECITER_IDS.map((id) => {
    const info = getReciterInfo(id);
    return {
      id,
      name: info ? (locale === "ar" ? info.name : info.englishName) : id,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Player state                                                        */
/* ------------------------------------------------------------------ */

export type AdhkarAudioStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type AdhkarAudioError = "offline" | "failed" | null;

/** Which of the two real sources a card plays from. */
export type AdhkarAudioSource = "quran" | "hisn";

export type AdhkarAudioState = {
  /** Which dhikr the player belongs to, so another card cannot steal the UI. */
  dhikrId: string | null;
  status: AdhkarAudioStatus;
  error: AdhkarAudioError;
  /** Where the current playback comes from, so the UI can label it correctly. */
  source: AdhkarAudioSource | null;
  /** The Quran reciter loaded for the current playback (null for a Hisn card). */
  reciterId: AdhkarReciterId | null;
};

const IDLE: AdhkarAudioState = {
  dhikrId: null,
  status: "idle",
  error: null,
  source: null,
  reciterId: null,
};

let state: AdhkarAudioState = IDLE;
const listeners = new Set<() => void>();

function publish(patch: Partial<AdhkarAudioState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAdhkarAudio(): AdhkarAudioState {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}

/* ------------------------------------------------------------------ */
/* The single audio element                                            */
/* ------------------------------------------------------------------ */

let audio: HTMLAudioElement | null = null;
let queue: string[] = [];
let queueIndex = 0;
/** Bumped by every start/stop, so a late async result cannot hijack playback. */
let session = 0;

const queueCache = new Map<string, AudioTrackQueue | null>();

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("playing", () => publish({ status: "playing", error: null }));
    audio.addEventListener("error", () => {
      /* Reset/teardown can surface an empty-source error; only a real
         playback failure (while something is loaded) is worth reporting. */
      if (state.status === "idle") return;
      publish({ status: "error", error: "failed" });
    });
  }
  return audio;
}

function onEnded(): void {
  if (queueIndex + 1 >= queue.length) {
    publish({ status: "idle" });
    return;
  }
  queueIndex += 1;
  void playTrack();
}

async function playTrack(): Promise<void> {
  const el = element();
  const url = queue[queueIndex];
  if (!url) {
    publish({ status: "error", error: "failed" });
    return;
  }
  try {
    el.src = url;
    await el.play();
  } catch {
    publish({ status: "error", error: "failed" });
  }
}

/** Stop the element without touching the published state. */
function silenceElement(): void {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  queue = [];
  queueIndex = 0;
}

/* ------------------------------------------------------------------ */
/* Which cards are playable                                            */
/* ------------------------------------------------------------------ */

/**
 * A card is playable only when it has a verified real recording: a Quran verse
 * reference, or a Hisn al-Muslim dhikr id. Everything else has no voice.
 */
export function canPlayDhikr(item: DhikrItem): boolean {
  return (item.audio?.length ?? 0) > 0 || typeof item.hisnId === "number";
}

/* ------------------------------------------------------------------ */
/* Verse URLs                                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolve the stored verse references to real recordings of the chosen
 * reciter, in reading order.
 *
 * `getSurahAudioQueue` derives the CDN directory from one API call per surah
 * (it does not download audio), so a card that spans four verses still needs a
 * single request. The derived queue is cached per reciter+surah: al-Baqarah
 * alone would otherwise be rebuilt for every card that opens it.
 */
async function resolveAyahUrls(
  refs: DhikrAyahRef[],
  reciterId: AdhkarReciterId
): Promise<string[]> {
  const bySurah = new Map<number, DhikrAyahRef[]>();
  for (const ref of refs) {
    const list = bySurah.get(ref.surah) ?? [];
    list.push(ref);
    bySurah.set(ref.surah, list);
  }

  const urls: string[] = [];
  for (const [surah, list] of bySurah) {
    const key = `${reciterId}:${surah}`;
    let tracks = queueCache.get(key);
    if (tracks === undefined) {
      tracks = await quranComProvider.getSurahAudioQueue(reciterId, surah);
      queueCache.set(key, tracks);
    }
    if (!tracks) throw new Error("no audio for this surah");
    for (const ref of list) {
      const track = tracks.tracks.find((candidate) => candidate.ayah === ref.ayah);
      if (!track) throw new Error(`no audio for ${surah}:${ref.ayah}`);
      urls.push(track.url);
    }
  }
  return urls;
}

/* ------------------------------------------------------------------ */
/* Public controls                                                     */
/* ------------------------------------------------------------------ */

/** Stop everything and go back to the resting state. */
export function stopAdhkarAudio(): void {
  session += 1;
  silenceElement();
  state = IDLE;
  for (const listener of listeners) listener();
}

/**
 * One button for play / pause / resume. Switching to another dhikr always stops
 * the previous recording first, so the two can never be heard together.
 */
export function toggleDhikrAudio(item: DhikrItem): void {
  if (!canPlayDhikr(item)) return;

  const sameDhikr = state.dhikrId === item.id;

  if (sameDhikr && state.status === "playing") {
    audio?.pause();
    publish({ status: "paused" });
    return;
  }

  if (sameDhikr && state.status === "paused" && state.error === null) {
    publish({ status: "playing" });
    void element()
      .play()
      .catch(() => publish({ status: "paused" }));
    return;
  }

  void start(item);
}

async function start(item: DhikrItem): Promise<void> {
  const token = ++session;
  silenceElement();

  const refs = item.audio ?? [];
  const fromHisn = refs.length === 0;

  if (fromHisn && typeof item.hisnId !== "number") {
    publish({ dhikrId: item.id, status: "error", error: "failed", source: null, reciterId: null });
    return;
  }

  const reciterId = fromHisn ? null : loadAdhkarReciter();
  publish({
    dhikrId: item.id,
    status: "loading",
    error: null,
    source: fromHisn ? "hisn" : "quran",
    reciterId,
  });

  if (!isOnline()) {
    publish({ status: "error", error: "offline" });
    return;
  }

  let urls: string[];
  if (fromHisn) {
    urls = [hisnAudioUrl(item.hisnId as number)];
  } else {
    try {
      urls = await resolveAyahUrls(refs, reciterId as AdhkarReciterId);
    } catch {
      if (token === session) publish({ status: "error", error: "failed" });
      return;
    }
  }

  /* The reader may have changed page, or pressed stop, while the URLs were
     being resolved: the late result must not start playing over that. */
  if (token !== session) return;
  if (urls.length === 0) {
    publish({ status: "error", error: "failed" });
    return;
  }

  queue = urls;
  queueIndex = 0;
  await playTrack();
}
