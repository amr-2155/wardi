export type Verse = {
  number: number;
  text: string;
};

export type Chapter = {
  id: number;
  name: string;
  transliteration: string;
  ayahCount: number;
  revelationPlace: string;
  verses: Verse[];
};

export type QuranManifest = {
  datasetVersion: string;
  source: string;
  sourceUrl: string;
  verificationDate: string;
  totalAyahs: number;
  chapters: number;
};

export type QuranDataset = {
  manifest: QuranManifest;
  chapters: Chapter[];
};

export type AyahRef = `${number}:${number}`;

export const RELATED_TYPES = [
  "theme",
  "topic",
  "similar_context",
  "same_concept",
  "related_story",
  "related_dua",
  "related_warning",
  "related_promise",
  "related_attribute",
] as const;

export type RelationType = (typeof RELATED_TYPES)[number];

export type RelatedAyah = {
  ayah: AyahRef;
  relationType: RelationType;
  reason: string;
  verified: boolean;
  source: string;
};

export type RelationEntry = {
  sourceAyah: AyahRef;
  topic: string;
  relatedAyahs: RelatedAyah[];
};

export type RelationsFile = {
  version: string;
  entries: RelationEntry[];
};

export type Topic = {
  id: string;
  name: string;
  ayahs: AyahRef[];
};

export type TopicsFile = {
  version: string;
  topics: Topic[];
};

export type QuranSearchResult = {
  ref: AyahRef;
  chapterId: number;
  text: string;
  matchedTopic?: string;
};

export type TafsirEntry = {
  ref: AyahRef;
  simplifiedMeaning: string;
  simplerMeaning: string;
  howToLive: string[];
  reflection: string;
  tafsirSource: string;
  reviewStatus: "reviewed";
};
