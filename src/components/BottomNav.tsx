"use client";

import { BookHeart, BookOpen, History, Library, Settings } from "lucide-react";
import { useLocale } from "@/lib/locale";
import type { TabId } from "@/lib/types";

const ITEMS: { id: TabId; labelKey: string; icon: typeof BookOpen }[] = [
  { id: "home", labelKey: "nav.home", icon: BookOpen },
  { id: "history", labelKey: "nav.history", icon: History },
  { id: "library", labelKey: "nav.library", icon: Library },
  { id: "khatma", labelKey: "nav.khatma", icon: BookHeart },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  const { t } = useLocale();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-col items-center gap-1 py-3 transition"
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
                  isActive ? "bg-primary-soft text-primary-ink" : "text-muted"
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              </span>
              <span
                className={`text-[10px] font-bold ${
                  isActive ? "text-primary-ink" : "text-muted"
                }`}
              >
                {t(item.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
