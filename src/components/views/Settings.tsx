"use client";

import { BookOpen, Database, Download, Music, Palette, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { PrayerSettingsPanel } from "@/components/PrayerSettingsPanel";
import { RemindersSettingsPanel } from "@/components/RemindersSettingsPanel";
import { Card, NumberField, SectionLabel, SegmentControl, Toggle } from "@/components/ui";
import {
  audioCacheStats,
  clearAudioCache,
  surahCacheInfo,
  removeSurahFromCache,
} from "@/lib/audio/cache";
import { SURAH_DATA } from "@/lib/audio/quran-com";
import { useLocale } from "@/lib/locale";
import { useAccent, type AccentId } from "@/lib/accent";
import type { ThemeMode } from "@/lib/types";
import type { WardData } from "@/hooks/useWardData";
import type { ImportPlan, ImportRejectionCode } from "@/lib/backup";

/**
 * Honest, specific rejection text. Never a generic "success".
 *
 * Each code maps to its own key so the message stays specific in both
 * languages; `settings.importError` ("Invalid file") is deliberately too
 * generic to stand in for these.
 */
const IMPORT_ERROR_KEYS: Record<ImportRejectionCode, string> = {
  "not-json": "settings.importCode.notJson",
  "not-object": "settings.importCode.notObject",
  "wrong-app": "settings.importCode.wrongApp",
  "unsupported-version": "settings.importCode.unsupportedVersion",
  "invalid-settings": "settings.importCode.invalidSettings",
  "invalid-history": "settings.importCode.invalidHistory",
  "invalid-progress": "settings.importCode.invalidProgress",
  "invalid-snapshot": "settings.importCode.invalidSnapshot",
};

/** Native language names, shown in both languages by convention. */
const LANGUAGES = [
  { value: "ar" as const, label: "العربية" },
  { value: "en" as const, label: "English" },
];

/** Accent swatches: fixed dots (identity colors), labels localized. */
const ACCENT_SWATCHES: { id: AccentId; dot: string; labelKey: string }[] = [
  { id: "gold", dot: "#d9b366", labelKey: "settings.accentGold" },
  { id: "emerald", dot: "#2fa36f", labelKey: "settings.accentEmerald" },
  { id: "sapphire", dot: "#3a7bd5", labelKey: "settings.accentSapphire" },
  { id: "maroon", dot: "#a43d5c", labelKey: "settings.accentMaroon" },
];

/** Surahs whose every verse is in the audio cache (whole-surah downloads). */
function listDownloadedSurahs(): { number: number; name: string; sizeMb: string }[] {
  return SURAH_DATA.filter((s) => {
    const info = surahCacheInfo(s.number);
    return s.ayahCount > 0 && info.count >= s.ayahCount;
  }).map((s) => ({
    number: s.number,
    name: s.name,
    sizeMb: (surahCacheInfo(s.number).bytes / 1048576).toFixed(1),
  }));
}

export function SettingsView({ data }: { data: WardData }) {
  const { t, locale, setLocale } = useLocale();
  const [accent, setAccent] = useAccent();
  const fileRef = useRef<HTMLInputElement>(null);
  /** null = idle, "applied" = done, or a rejection code. */
  const [importStatus, setImportStatus] = useState<"applied" | ImportRejectionCode | null>(null);
  /** A validated plan awaiting the user's explicit confirmation. */
  const [pending, setPending] = useState<ImportPlan | null>(null);
  const [audioStats, setAudioStats] = useState(() => audioCacheStats());
  const [clearedAudio, setClearedAudio] = useState(false);
  const [downloads, setDownloads] = useState(listDownloadedSurahs);
  const auto = data.settings.autoIncrease;

  const refreshAudioState = () => {
    setAudioStats(audioCacheStats());
    setDownloads(listDownloadedSurahs());
  };

  const handleClearAudioCache = () => {
    void clearAudioCache().then(() => {
      refreshAudioState();
      setClearedAudio(true);
      window.setTimeout(() => setClearedAudio(false), 2000);
    });
  };

  const handleRemoveDownload = (surah: number) => {
    void removeSurahFromCache(surah).then(refreshAudioState);
  };

  const handleExport = () => {
    const blob = new Blob([data.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wardi-backup-${data.today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Phase 1: parse + validate only. Nothing is written here, so a bad file
     cannot touch existing data. A valid file produces a plan to confirm. */
  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const result = data.previewImport(text);
    if (result.ok) {
      setPending(result);
      setImportStatus(null);
    } else {
      setPending(null);
      setImportStatus(result.code);
    }
  };

  /* Phase 2: the user confirmed, so apply the already-validated plan. */
  const handleConfirmImport = () => {
    if (!pending) return;
    const ok = data.confirmImport(pending);
    setPending(null);
    setImportStatus(ok ? "applied" : "invalid-snapshot");
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 pb-32 pt-6">
      <h2 className="text-2xl font-black">{t("settings.title")}</h2>

      {/* WARD */}
      <SectionLabel>{t("nav.home")}</SectionLabel>
      <Card className="space-y-4 p-4">
        <NumberField
          label={t("settings.lastPage")}
          value={data.settings.currentPage}
          onChange={(v) => data.updateSetting("currentPage", Math.min(data.settings.totalPages, v))}
        />
        {auto ? (
          <NumberField
            label={t("settings.baseWard")}
            value={data.settings.baseDailyPages}
            onChange={(v) => data.updateSetting("baseDailyPages", v)}
          />
        ) : (
          <NumberField
            label={t("settings.currentWard")}
            value={data.settings.dailyPages}
            onChange={(v) => data.updateSetting("dailyPages", v)}
          />
        )}
      </Card>

      {/* DEVELOPMENT */}
      <div className="mt-5">
        <SectionLabel>{t("settings.growthSection")}</SectionLabel>
        <Card className="p-4">
          <Toggle
            checked={auto}
            onChange={() => data.toggleAutoIncrease()}
            label={t("settings.autoIncrease")}
            description={t("settings.autoIncreaseDesc")}
          />
          {auto && (
            <div className="mt-4 animate-fade-up space-y-4 border-t border-line pt-4">
              <NumberField
                label={t("settings.increaseAmount")}
                value={data.settings.increaseAmount}
                onChange={(v) => data.updateSetting("increaseAmount", v)}
              />
              <NumberField
                label={t("settings.increaseEvery")}
                value={data.settings.increaseEveryDays}
                onChange={(v) => data.updateSetting("increaseEveryDays", v)}
              />
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-muted">
                  {t("settings.startDate")}
                </span>
                <input
                  type="date"
                  value={data.settings.increaseStartDate}
                  onChange={(e) => data.updateSetting("increaseStartDate", e.target.value)}
                  className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <div className="rounded-2xl bg-primary-soft p-4">
                <p className="text-[10px] text-muted">{t("settings.computedWard")}</p>
                <p className="text-lg font-black">
                  {data.dailyPages} {t("week.pages")}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {t("settings.formula", { base: data.settings.baseDailyPages })}
                </p>
              </div>
            </div>
          )}
          <div className="mt-4 animate-fade-up space-y-4 border-t border-line pt-4">
            <Toggle
              checked={data.settings.khatmaIncreaseEnabled}
              onChange={(v) => data.updateSetting("khatmaIncreaseEnabled", v)}
              label={t("settings.khatmaIncrease.title")}
              description={t("settings.khatmaIncrease.desc")}
            />
            {data.settings.khatmaIncreaseEnabled && (
              <NumberField
                label={t("settings.khatmaIncrease.amount")}
                value={data.settings.khatmaIncreaseAmount}
                onChange={(v) => data.updateSetting("khatmaIncreaseAmount", v)}
              />
            )}
          </div>
        </Card>
      </div>

      {/* QURAN */}
      <div className="mt-5">
        <SectionLabel>{t("settings.quranSection")}</SectionLabel>
        <Card className="p-4">
          <NumberField
            label={t("settings.totalPages")}
            value={data.settings.totalPages}
            onChange={(v) => data.updateSetting("totalPages", v)}
          />
        </Card>
      </div>

      {/* AUDIO CACHE (offline replay of recently played verses) */}
      <div className="mt-5">
        <SectionLabel>{t("settings.audioCache.section")}</SectionLabel>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Music size={16} className="text-gold-strong" />
            {t("settings.audioCache.title")}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            {t("settings.audioCache.desc")}
          </p>
          <p className="mt-2 text-xs font-black text-ink">
            {audioStats.count === 0
              ? t("settings.audioCache.empty")
              : t("settings.audioCache.stats", {
                  count: audioStats.count,
                  size: (audioStats.bytes / 1048576).toFixed(1),
                })}
          </p>
          {downloads.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              <p className="text-[11px] font-black text-muted">
                {t("settings.audioCache.downloads")}
              </p>
              {downloads.map((d) => (
                <div
                  key={d.number}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-bold">{d.name}</span>
                  <span className="flex items-center gap-2 text-[11px] font-black text-gold-strong">
                    {t("audio.downloadedSize", { size: d.sizeMb })}
                    <button
                      type="button"
                      onClick={() => handleRemoveDownload(d.number)}
                      aria-label={`${t("audio.deleteDownload")} ${d.name}`}
                      title={t("audio.deleteDownload")}
                      className="text-danger transition active:scale-95"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {audioStats.count > 0 && (
            <button
              type="button"
              onClick={handleClearAudioCache}
              className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 text-xs font-black text-danger transition active:scale-[0.98]"
            >
              <Trash2 size={14} />
              {clearedAudio
                ? t("settings.audioCache.cleared")
                : t("settings.audioCache.clear")}
            </button>
          )}
        </Card>
      </div>

      {/* APPEARANCE */}
      <div className="mt-5">
        <SectionLabel>{t("settings.appearance")}</SectionLabel>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Palette size={16} className="text-gold-strong" />
            {t("settings.appearance")}
          </div>
          <SegmentControl<ThemeMode>
            options={[
              { value: "light", label: t("settings.themeLight") },
              { value: "dark", label: t("settings.themeDark") },
              { value: "system", label: t("settings.themeSystem") },
            ]}
            value={data.settings.theme}
            onChange={(theme) => data.applyTheme(theme)}
          />
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2.5 text-[11px] font-bold text-muted">{t("settings.accent")}</p>
            <div className="flex gap-2.5" role="radiogroup" aria-label={t("settings.accent")}>
              {ACCENT_SWATCHES.map((sw) => (
                <button
                  key={sw.id}
                  type="button"
                  role="radio"
                  aria-checked={accent === sw.id}
                  aria-label={t(sw.labelKey)}
                  title={t(sw.labelKey)}
                  onClick={() => setAccent(sw.id)}
                  style={{ backgroundColor: sw.dot }}
                  className={`h-11 w-11 rounded-full shadow-sm transition active:scale-90 ${
                    accent === sw.id ? "ring-2 ring-offset-2 ring-gold-strong ring-offset-surface" : "ring-1 ring-line"
                  }`}
                />
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* LANGUAGE */}
      <div className="mt-5">
        <SectionLabel>{t("settings.language")}</SectionLabel>
        <Card className="p-4">
          <SegmentControl
            options={LANGUAGES}
            value={locale}
            onChange={setLocale}
          />
        </Card>
      </div>

      {/* PRAYER — mounted here so the persisted calculation method, madhab,
          iqama offset and sound actually have a UI that can change them.
          Without this the whole prayer settings surface was write-only. */}
      <PrayerSettingsPanel />

      {/* REMINDERS — one organised section: ward, prayer, iqama, white days
          and sounds. Replaces the separate Notifications card. */}
      <RemindersSettingsPanel data={data} />

      {/* DATA */}
      <div className="mt-5">
        <SectionLabel>{t("settings.dataSection")}</SectionLabel>
        <Card className="space-y-3 p-4">
          <button
            type="button"
            onClick={handleExport}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-xs font-bold transition active:scale-[0.98]"
          >
            <Download size={16} /> {t("settings.export")}
          </button>
          <button
            type="button"
            onClick={() => {
              setImportStatus(null);
              setPending(null);
              fileRef.current?.click();
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 text-xs font-bold transition active:scale-[0.98]"
          >
            <Upload size={16} /> {t("settings.import")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />

          {/* Overwrite confirmation — nothing is written until this is accepted. */}
          {pending && (
            <div className="space-y-3 rounded-2xl border border-danger/25 bg-danger-soft p-4">
              <p className="text-[12px] font-bold leading-relaxed text-danger">
                {t("settings.importConfirm.warning")}
              </p>
              <ul className="space-y-1 text-[10px] text-muted">
                <li>
                  {t("settings.importConfirm.historyEntries", {
                    n: pending.summary.historyEntries,
                  })}
                </li>
                <li>
                  {t("settings.importConfirm.khatmaNumber", {
                    n: pending.summary.khatmaNumber,
                  })}
                </li>
                <li>
                  {t("settings.importConfirm.categories", {
                    n: pending.categories.length,
                  })}
                </li>
                {pending.summary.exportedAt && (
                  <li>
                    {t("settings.importConfirm.exportedAt", {
                      date: pending.summary.exportedAt.slice(0, 10),
                    })}
                  </li>
                )}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="h-10 flex-1 rounded-xl bg-danger text-[11px] font-bold text-white transition active:scale-[0.98]"
                >
                  {t("settings.importConfirm.accept")}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="h-10 flex-1 rounded-xl bg-surface-2 text-[11px] font-bold transition active:scale-[0.98]"
                >
                  {t("ui.cancel")}
                </button>
              </div>
            </div>
          )}

          {importStatus === "applied" && (
            <p className="text-center text-[11px] font-bold text-success">
              {t("settings.importSuccess")}
            </p>
          )}
          {importStatus !== null && importStatus !== "applied" && (
            <p className="text-center text-[11px] font-bold text-danger">
              {t(IMPORT_ERROR_KEYS[importStatus])}
            </p>
          )}
          <div className="flex items-center gap-2 border-t border-line pt-3 text-[10px] text-muted">
            <Database size={13} />
            {t("settings.dataNote")}
          </div>
        </Card>
      </div>

      {/* DANGER */}
      <div className="mt-5">
        <Card className="border border-danger/20 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-danger">
            <Trash2 size={16} />
            {t("settings.dangerZone")}
          </div>
          <button
            type="button"
            onClick={data.resetApp}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-danger-soft text-xs font-bold text-danger transition active:scale-[0.98]"
          >
            <Trash2 size={16} /> {t("settings.deleteAll")}
          </button>
        </Card>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-muted">
        <BookOpen size={12} className="text-gold-strong" />
        {t("settings.about")}
      </p>
    </div>
  );
}
