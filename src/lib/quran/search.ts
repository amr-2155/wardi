import type { QuranDataset, QuranSearchResult, Topic } from "./types";
import { makeNormalizedIndex } from "./normalize";
import { getGlobalId } from "./validate";

export type SearchIndex = {
  ref: string;
  chapterId: number;
  normalized: string;
};

export function buildSearchIndex(dataset: QuranDataset, topics: Topic[]): SearchIndex[] {
  const topicToRefs = new Map<string, string[]>();
  for (const topic of topics) {
    for (const ref of topic.ayahs) topicToRefs.set(ref, [...(topicToRefs.get(ref) ?? []), topic.name]);
  }
  const index: SearchIndex[] = [];
  for (const chapter of dataset.chapters) {
    for (const verse of chapter.verses) {
      index.push({
        ref: `${chapter.id}:${verse.number}`,
        chapterId: chapter.id,
        normalized: makeNormalizedIndex(verse.text),
      });
    }
  }
  return index;
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
      const matchedTopic = topicToRefs.get(ref)?.join("، ");
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
