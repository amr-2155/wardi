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
import { AudioPlayerProvider } from "@/components/providers/AudioProvider";
import { useQuran } from "@/hooks/useQuran";
import { useWardData } from "@/hooks/useWardData";
import type { FullViewId, TabId } from "@/lib/types";

type QuranRoute =
  | { mode: "ayah"; ayahId: string }
  | { mode: "reader"; chapterId: number; highlightAyah?: string }
  | null;

export default function Page() {
  const data = useWardData();
  const quran = useQuran({ dailyPages: data.dailyPages, totalPages: data.settings.totalPages });
  const [tab, setTab] = useState<TabId>("home");
  const [view, setView] = useState<FullViewId | null>(null);
  const [quranRoute, setQuranRoute] = useState<QuranRoute>(null);
  const [showTadabbur, setShowTadabbur] = useState(false);

  if (!data.loaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-ink">
        <p className="animate-pulse text-sm font-bold text-muted">جاري تحميل وردي...</p>
      </div>
    );
  }

  return (
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
          return <MushafReaderView data={data} quran={quran} onBack={() => setView(null)} />;
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
                onOpen={setView}
                onOpenTadabbur={() => setShowTadabbur(true)}
              />
            )}
            {tab === "history" && <HistoryView data={data} />}
            {tab === "khatma" && <KhatmaView data={data} />}
            {tab === "library" && (
              <LibraryView
                quran={quran}
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
          </div>
        );
      })()}
    </AudioPlayerProvider>
  );
}
