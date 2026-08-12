"use client";

import type { ReactNode } from "react";

export function ProgressRing({
  percent,
  size = 64,
  stroke = 6,
  track,
  bar,
  className = "",
  label,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  track?: string;
  bar?: string;
  className?: string;
  label?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`التقدم ${clamped}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track ?? "var(--primary-soft)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bar ?? "var(--gold)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {label !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">{label}</div>
      )}
    </div>
  );
}
