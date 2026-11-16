"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/lib/locale";

/* How long the branded opening screen stays on screen. The last ~0.4s is the
   fade-out, so the visible hold is just under three seconds. */
const SPLASH_MS = 3000;
const FADE_MS = 420;

/**
 * The opening screen: a branded icon, the app name, and one plain sentence
 * explaining what the app does. It is purely presentational — the app loads
 * behind it and the overlay removes itself, so it can never block navigation.
 */
export function SplashScreen() {
  const { locale, t } = useLocale();
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    const leave = window.setTimeout(() => setPhase("leaving"), SPLASH_MS - FADE_MS);
    const gone = window.setTimeout(() => setPhase("gone"), SPLASH_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={phase === "leaving"}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-primary px-8 text-center text-white transition-opacity ease-out ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Soft light behind the mark, so the icon reads as lit rather than pasted. */}
      <div className="pointer-events-none absolute -top-24 end-[-4rem] h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-6rem] start-[-4rem] h-72 w-72 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex flex-col items-center">
        <div className="animate-glow-pulse absolute h-32 w-32 rounded-[40px] bg-gold/20 blur-2xl" />
        <Image
          src="/wardi-icon-1024.png"
          alt={t("app.name")}
          width={112}
          height={112}
          preload
          draggable={false}
          className="animate-scale-in-soft relative h-28 w-28 rounded-[30px] object-cover shadow-[0_30px_70px_-24px_rgba(177,138,62,0.75)] ring-1 ring-white/20"
        />
        <h1 className="animate-rise-in mt-6 text-3xl font-black tracking-tight">
          {t("app.name")}
        </h1>
        <p
          className="animate-rise-in mt-2 text-sm font-bold text-gold"
          style={{ animationDelay: "120ms" }}
        >
          {t("splash.tagline")}
        </p>
        <p
          className="animate-rise-in mt-4 max-w-xs text-[13px] leading-6 text-white/70"
          style={{ animationDelay: "220ms" }}
        >
          {t("splash.desc")}
        </p>
      </div>

      {/* The three-second line doubles as a quiet progress cue. */}
      <div className="relative mt-10 h-1 w-40 overflow-hidden rounded-full bg-white/15">
        <span
          className="block h-full w-full rounded-full bg-gold"
          style={{
            animation: `splash-progress ${SPLASH_MS}ms linear forwards`,
            transformOrigin: locale === "ar" ? "right" : "left",
          }}
        />
      </div>
    </div>
  );
}
