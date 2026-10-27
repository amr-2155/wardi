"use client";

import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { TadabburSheet } from "@/components/TadabburSheet";
import { HistoryView } from "@/components/views/History";
import { HomeView } from "@/components/views/Home";
import { KhatmaView } from "@/components/views/Khatma";
import { LibraryView } from "@/components/views/Library";
import { PlanView } from "@/components/views/Plan";
import { ReadingModeView } from "@/components/views/ReadingMode";
import { SettingsView } from "@/components/views/Settings";
import { StatsView } from "@/components/views/Stats";
import { AyahView } from "@/components/views/Ayah";
import { QuranReaderView } from "@/components/views/QuranReader";
import { MushafReaderView } from "@/components/views/MushafReader";
import { PrayerView } from "@/components/views/PrayerView";
import { AdhkarView } from "@/components/views/adhkar/AdhkarView";
import { NiyyahView } from "@/components/views/NiyyahView";
import { OccasionsView } from "@/components/views/OccasionsView";
import { OnboardingOverlay } from "@/components/views/Onboarding";
import { AudioPlayerProvider } from "@/components/providers/AudioProvider";
import { PrayerProvider } from "@/components/providers/PrayerProvider";
import { useQuran } from "@/hooks/useQuran";
import { useWardData } from "@/hooks/useWardData";
import { useLocale } from "@/lib/locale";
import { loadOnboarding } from "@/lib/onboarding";
import type { FullViewId, TabId } from "@/lib/types";
import type { ReaderMode } from "@/components/SegmentedControl";

type QuranRoute =
  | { mode: "ayah"; ayahId: string }
  | { mode: "reader"; chapterId: number; highlightAyah?: string }
  | null;

export default function Page() {
  const { t } = useLocale();
  const data = useWardData();
  const quran = useQuran({ dailyPages: data.dailyPages, totalPages: data.settings.totalPages });
  const [tab, setTab] = useState<TabId>("home");
  const [view, setView] = useState<FullViewId | null>(null);
  /* Remembers whether the Mushaf was opened for the full mushaf or just
     today's ward, so the reader boots in the matching mode. */
  const [mushafMode, setMushafMode] = useState<ReaderMode>("ward");
  const [quranRoute, setQuranRoute] = useState<QuranRoute>(null);
  const [showTadabbur, setShowTadabbur] = useState(false);
  /* First-launch setup. Lazy init reads localStorage once; the overlay writes
     the seen-flag itself, so dismissing it can never reopen it. */
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboarding().seen);

  if (!data.loaded) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg text-ink">
        <span className="animate-glow-pulse flex h-20 w-20 items-center justify-center rounded-[26px] bg-gold text-3xl font-black text-primary-deep shadow-lg shadow-gold/25">
          و
        </span>
        <p className="text-lg font-black">{t("app.name")}</p>
        <p className="animate-pulse text-xs font-bold text-muted">{t("app.loading")}</p>
      </div>
    );
  }

  return (
    <PrayerProvider>
      <AudioPlayerProvider>
      {(() => {
        if (view === "reading") {
          return <ReadingModeView data={data} onBack={() => setView(null)} />;
        }
        if (view === "plan") {
          return <PlanView data={data} onBack={() => setView(null)} />;
        }
        if (view === "stats") {
          return <StatsView data={data} onBack={() => setView(null)} />;
        }
        if (view === "mushaf") {
          return (
            <MushafReaderView
              data={data}
              quran={quran}
              onBack={() => setView(null)}
              initialMode={mushafMode}
            />
          );
        }
        if (view === "prayer") {
          return <PrayerView onBack={() => setView(null)} />;
        }
        if (view === "adhkar") {
          return <AdhkarView onBack={() => setView(null)} />;
        }
        if (view === "niyyah") {
          return <NiyyahView onBack={() => setView(null)} />;
        }
        if (view === "occasions") {
          return <OccasionsView onBack={() => setView(null)} />;
        }
        if (quranRoute?.mode === "ayah") {
          return (
            <AyahView
              quran={quran}
              ayahId={quranRoute.ayahId}
              onBack={() => setQuranRoute(null)}
              onOpenContext={(chapterId, highlightAyah) =>
                setQuranRoute({ mode: "reader", chapterId, highlightAyah })
              }
              onOpenAyah={(ayahId) => setQuranRoute({ mode: "ayah", ayahId })}
            />
          );
        }
        if (quranRoute?.mode === "reader") {
          return (
            <QuranReaderView
              quran={quran}
              chapterId={quranRoute.chapterId}
              highlightAyah={quranRoute.highlightAyah}
              onBack={() => setQuranRoute(null)}
              onOpenAyah={(ayahId) => setQuranRoute({ mode: "ayah", ayahId })}
            />
          );
        }
        return (
          <div className="bg-bg text-ink">
            {tab === "home" && (
              <HomeView
                data={data}
                quran={quran}
                onOpen={(v, mode) => {
                  if (v === "mushaf" && mode) setMushafMode(mode);
                  setView(v);
                }}
                onOpenTadabbur={() => setShowTadabbur(true)}
              />
            )}
            {tab === "history" && <HistoryView data={data} />}
            {tab === "khatma" && <KhatmaView data={data} />}
            {tab === "library" && (
              <LibraryView
                quran={quran}
                data={data}
                onOpen={setView}
                onOpenAyah={(ayahId) => setQuranRoute({ mode: "ayah", ayahId })}
                onOpenDaily={() =>
                  quran.daily && setQuranRoute({ mode: "ayah", ayahId: quran.daily.ref })
                }
              />
            )}
            {tab === "settings" && <SettingsView data={data} />}
            <BottomNav active={tab} onChange={setTab} />
            <TadabburSheet
              open={showTadabbur}
              onClose={() => setShowTadabbur(false)}
              quran={quran}
              onOpenAyah={(ayahId) => {
                setShowTadabbur(false);
                setQuranRoute({ mode: "ayah", ayahId });
              }}
            />
            {showOnboarding && (
              <OnboardingOverlay data={data} onDone={() => setShowOnboarding(false)} />
            )}
          </div>
        );
      })()}
    </AudioPlayerProvider>
    </PrayerProvider>
  );
}
