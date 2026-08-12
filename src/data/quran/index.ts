import type { RelationsFile, TafsirEntry, Topic } from "@/lib/quran/types";
import relationsJson from "./ayah-relations.json";
import topicsJson from "./topics.json";
import tafsirJson from "./tafsir.json";

export const RELATIONS = relationsJson as unknown as RelationsFile;
export const TOPICS = (topicsJson as unknown as { topics: Topic[] }).topics;
export const TAFSIR = (tafsirJson as unknown as { entries: TafsirEntry[] }).entries;
