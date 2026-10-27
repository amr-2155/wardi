"use client";

import type { PrayerId } from "@/lib/prayer";

type Phase = "dawn" | "morning" | "day" | "afternoon" | "sunset" | "night";

/** The sky follows the *next* prayer, so it drifts through the day with you. */
function phaseOf(prayer: PrayerId): Phase {
  switch (prayer) {
    case "fajr":
      return "dawn";
    case "sunrise":
      return "morning";
    case "dhuhr":
      return "day";
    case "asr":
      return "afternoon";
    case "maghrib":
      return "sunset";
    case "isha":
      return "night";
    default:
      return "day";
  }
}

const SKY: Record<Phase, { from: string; mid: string; to: string }> = {
  dawn: { from: "#1b2340", mid: "#5b3a63", to: "#e8935a" },
  morning: { from: "#3d7ab8", mid: "#8fc3e8", to: "#f7d9a0" },
  day: { from: "#2f6fd0", mid: "#7db9f0", to: "#cfeaff" },
  afternoon: { from: "#3a6ea8", mid: "#e0a55e", to: "#f7d9a0" },
  sunset: { from: "#2c2150", mid: "#a03e63", to: "#f08a4b" },
  night: { from: "#060a1c", mid: "#14224d", to: "#2c3a6e" },
};

const STARS: [number, number, number][] = [
  [28, 22, 1.6], [70, 44, 1.1], [112, 18, 1.4], [155, 52, 1.0],
  [196, 24, 1.5], [238, 48, 1.1], [278, 20, 1.4], [318, 54, 1.0],
  [352, 26, 1.5], [382, 46, 1.1], [48, 66, 1.0], [170, 70, 1.2],
  [262, 68, 1.0], [336, 72, 1.2],
];

/**
 * Living mosque backdrop for the next-prayer hero. Pure SVG + CSS motion
 * (stars twinkle, clouds drift, sun/moon glow); `aria-hidden` because every
 * fact it illustrates is already rendered as text beside it.
 */
export function PrayerSky({ prayer }: { prayer: PrayerId }) {
  const phase = phaseOf(prayer);
  const sky = SKY[phase];
  const gid = `psky-${phase}`;
  const nightish = phase === "night" || phase === "dawn" || phase === "sunset";
  const sunY = phase === "morning" ? 96 : phase === "day" ? 44 : phase === "afternoon" ? 78 : 108;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 168"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky.from} />
          <stop offset="55%" stopColor={sky.mid} />
          <stop offset="100%" stopColor={sky.to} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="400" height="168" fill={`url(#${gid})`} />

      {/* stars */}
      {nightish &&
        STARS.map(([x, y, r], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill="#fff"
            opacity="0.85"
            className="animate-pulse-subtle"
            style={{ animationDelay: `${(i % 7) * 0.35}s` }}
          />
        ))}

      {/* sun / moon */}
      {phase === "night" || phase === "dawn" ? (
        <g className="animate-glow-pulse">
          <circle cx="322" cy="44" r="17" fill="#f4f1de" opacity="0.95" />
          <circle cx="315" cy="38" r="14" fill={sky.mid} opacity="0.55" />
        </g>
      ) : (
        <g className="animate-glow-pulse">
          <circle cx="322" cy={sunY} r="26" fill="#ffd873" opacity="0.35" />
          <circle cx="322" cy={sunY} r="15" fill="#ffe9a8" />
        </g>
      )}

      {/* drifting clouds */}
      {(phase === "morning" || phase === "day" || phase === "afternoon") && (
        <g fill="#ffffff" opacity="0.5" className="animate-sky-drift">
          <ellipse cx="90" cy="52" rx="34" ry="9" />
          <ellipse cx="120" cy="46" rx="26" ry="8" />
          <ellipse cx="300" cy="86" rx="30" ry="8" opacity="0.7" />
        </g>
      )}

      {/* mosque silhouette */}
      <g fill="#0b1e19" opacity="0.92">
        <rect x="0" y="146" width="400" height="22" />
        {/* left minaret */}
        <rect x="52" y="78" width="10" height="70" rx="2" />
        <circle cx="57" cy="72" r="8" />
        <rect x="56" y="56" width="2" height="10" />
        {/* right minaret */}
        <rect x="338" y="78" width="10" height="70" rx="2" />
        <circle cx="343" cy="72" r="8" />
        <rect x="342" y="56" width="2" height="10" />
        {/* main hall + drum + dome */}
        <rect x="120" y="118" width="160" height="30" />
        <rect x="172" y="104" width="56" height="16" />
        <path d="M172 104 C172 74 200 66 200 66 C200 66 228 74 228 104 Z" />
        <rect x="199" y="52" width="2" height="16" />
        <circle cx="200" cy="49" r="3.5" fill="none" stroke="#0b1e19" strokeWidth="2" />
        {/* side domes */}
        <path d="M128 118 C128 102 142 98 142 98 C142 98 156 102 156 118 Z" />
        <path d="M244 118 C244 102 258 98 258 98 C258 98 272 102 272 118 Z" />
      </g>
    </svg>
  );
}
