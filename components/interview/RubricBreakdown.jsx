"use client";
import React from "react";

/**
 * The rubric dimensions, in display order. Kept in one place so the bars, the
 * labels, and the colors stay consistent everywhere the breakdown is shown.
 */
const DIMENSIONS = [
  { key: "correctness", label: "Correctness" },
  { key: "clarity", label: "Clarity" },
  { key: "depth", label: "Depth" },
  { key: "communication", label: "Communication" },
];

const barColor = (score) => {
  if (typeof score !== "number") return "bg-gray-300";
  if (score >= 8) return "bg-green-500";
  if (score >= 5) return "bg-yellow-500";
  return "bg-red-500";
};

/**
 * Horizontal 0-10 bars for the four rubric dimensions. Renders nothing when no
 * dimension has a numeric score, so it is safe to drop in for pre-rubric
 * answers (their scores are null).
 *
 * @param {{ scores?: { correctness?: number|null, clarity?: number|null, depth?: number|null, communication?: number|null }, className?: string }} props
 */
export default function RubricBreakdown({ scores, className = "" }) {
  const hasAny = DIMENSIONS.some((d) => typeof scores?.[d.key] === "number");
  if (!hasAny) return null;

  return (
    <div className={className}>
      <div className="space-y-2">
        {DIMENSIONS.map((d) => {
          const value = scores?.[d.key];
          const pct = typeof value === "number" ? (value / 10) * 100 : 0;
          return (
            <div key={d.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-gray-600">
                {d.label}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full ${barColor(value)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-medium text-gray-700">
                {typeof value === "number" ? `${value}/10` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
