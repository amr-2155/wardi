import type { QuranDataset, QuranSearchResult, Topic } from "./types";
import { makeNormalizedIndex } from "./normalize";
import { getGlobalId } from "./validate";

/** Separator used when a verse belongs to more than one topic. Must match the
    join used by searchQuran so both paths produce byte-identical payloads. */
const TOPIC_JOIN = "، ";

export type SearchIndex = {
  ref: string;
  chapterId: number;
  /** Pre-normalized verse text: the only field a substring match needs. */
  normalized: string;
  /** Raw verse text, kept to rebuild the result payload. */
  text: string;
  /** Raw joined topic names for this verse, kept for topic matching + payload. */
  matchedTopic?: string;
};

/**
 * Pre-normalize every verse once, so queries scan plain strings instead of
 * re-running Arabic normalization on all 6,236 verses per keystroke.
 *
 * Entries are pushed in dataset order (chapter order, then verse order) and
 * carry the raw topic names, so searchWithIndex reproduces searchQuran's
 * results, ordering and payloads exactly.
 */
export function buildSearchIndex(dataset: QuranDataset, topics: Topic[]): SearchIndex[] {
  const topicToRefs = new Map<string, string[]>();
  for (const topic of topics) {
    for (const ref of topic.ayahs) topicToRefs.set(ref, [...(topicToRefs.get(ref) ?? []), topic.name]);
  }
  const index: SearchIndex[] = [];
  for (const chapter of dataset.chapters) {
    for (const verse of chapter.verses) {
      const ref = `${chapter.id}:${verse.number}`;
      const names = topicToRefs.get(ref);
      const matchedTopic = names ? names.join(TOPIC_JOIN) : undefined;
      index.push({
        ref,
        chapterId: chapter.id,
        normalized: makeNormalizedIndex(verse.text),
        text: verse.text,
        ...(matchedTopic === undefined ? {} : { matchedTopic }),
      });
    }
  }
  return index;
}

/**
 * Query a prebuilt index. Matching rules are identical to searchQuran:
 * a hit is a substring of the normalized verse text, or a substring of the
 * verse's raw topic names.
 */
export function searchWithIndex(
  index: SearchIndex[],
  query: string,
  limit = 40
): QuranSearchResult[] {
  const q = makeNormalizedIndex(query);
  if (q.length === 0) return [];

  const results: QuranSearchResult[] = [];
  for (const entry of index) {
    if (entry.normalized.includes(q) || (entry.matchedTopic && entry.matchedTopic.includes(q))) {
      const matchedTopic = entry.matchedTopic;
      results.push({
        ref: entry.ref as `${number}:${number}`,
        chapterId: entry.chapterId,
        text: matchedTopic ? `${entry.text} · ${matchedTopic}` : entry.text,
        matchedTopic,
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

export function searchQuran(
  query: string,
  dataset: QuranDataset,
  topics: Topic[],
  limit = 40
): QuranSearchResult[] {
  const q = makeNormalizedIndex(query);
  if (q.length === 0) return [];

  const topicToRefs = new Map<string, string[]>();
  for (const topic of topics) {
    for (const ref of topic.ayahs) topicToRefs.set(ref, [...(topicToRefs.get(ref) ?? []), topic.name]);
  }

  const results: QuranSearchResult[] = [];
  for (const chapter of dataset.chapters) {
    for (const verse of chapter.verses) {
      const ref = `${chapter.id}:${verse.number}` as `${number}:${number}`;
      const normalized = makeNormalizedIndex(verse.text);
      const matchedTopic = topicToRefs.get(ref)?.join(TOPIC_JOIN);
      const text = matchedTopic ? `${verse.text} · ${matchedTopic}` : verse.text;
      if (normalized.includes(q) || (matchedTopic && matchedTopic.includes(q))) {
        results.push({ ref, chapterId: chapter.id, text, matchedTopic });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export function getVerseTopics(
  ref: string,
  topics: Topic[]
): Topic[] {
  return topics.filter((t) => t.ayahs.includes(ref as never));
}

export function getGlobalIdOfRef(ref: string, dataset: QuranDataset): number | null {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(ref.trim());
  if (!m) return null;
  return getGlobalId(Number(m[1]), Number(m[2]), dataset.chapters);
}
