"use client";

import { BookHeart, BookOpen, History, Library, Settings } from "lucide-react";
import type { TabId } from "@/lib/types";

const ITEMS: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "home", label: "وردي", icon: BookOpen },
  { id: "history", label: "السجل", icon: History },
  { id: "library", label: "المكتبة", icon: Library },
  { id: "khatma", label: "ختماتي", icon: BookHeart },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
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
                  isActive ? "bg-primary-soft text-primary" : "text-muted"
                }`}
              >
                <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              </span>
              <span
                className={`text-[10px] font-bold ${
                  isActive ? "text-primary" : "text-muted"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
