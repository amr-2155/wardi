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
  showDot = false,
  dotColor,
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
  /** Draw a small pointer at the tip of the arc, showing exactly where the
      reader has reached. The dot rotates with the arc instead of jumping. */
  showDot?: boolean;
  dotColor?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;
  /* Keep the pointer legible even on a very thin ring. */
  const dotRadius = Math.max(2.2, stroke * 0.62);

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
        {showDot && (
          <g
            transform={`rotate(${(clamped / 100) * 360} ${size / 2} ${size / 2})`}
            className="transition-transform duration-500 ease-out"
            aria-hidden
          >
            <circle
              cx={size / 2}
              cy={size / 2 - radius}
              r={dotRadius}
              fill={dotColor ?? bar ?? "var(--gold)"}
              stroke="rgba(255,255,255,0.92)"
              strokeWidth={1.4}
            />
          </g>
        )}
      </svg>
      {label !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          {typeof label === "function" ? label(clamped) : label}
        </div>
      )}
    </div>
  );
}
