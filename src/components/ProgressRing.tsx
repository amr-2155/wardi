"use client";

import type { CSSProperties, ReactNode } from "react";

export function ProgressRing({
  percent,
  size = 64,
  stroke = 6,
  track,
  bar,
  className = "",
  label,
  animated = false,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  track?: string;
  bar?: string;
  className?: string;
  /** Static node or a render-prop receiving the clamped percent. */
  label?: ReactNode | ((percent: number) => ReactNode);
  /** Animate the arc from empty on mount (completion celebrations). */
  animated?: boolean;
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
          style={
            animated
              ? ({ "--ring-from": circumference, "--ring-to": offset } as CSSProperties)
              : undefined
          }
          className={`transition-all duration-500 ease-out${animated ? " animate-ring-fill" : ""}`}
        />
      </svg>
      {label !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          {typeof label === "function" ? label(clamped) : label}
        </div>
      )}
    </div>
  );
}
