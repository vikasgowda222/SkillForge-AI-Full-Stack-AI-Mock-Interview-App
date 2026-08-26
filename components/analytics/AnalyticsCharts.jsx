"use client";
import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Client-only analytics visualisations built on Recharts.
 * @param {{ analytics: { timeline: Array<{index:number, rating:number}>, skillAverages: Record<string, number|null>, distribution: Array<{band:string, count:number}>, totalScored: number } }} props
 */
export default function AnalyticsCharts({ analytics }) {
  const { timeline, skillAverages, distribution, totalScored } = analytics;

  if (!totalScored) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        No scored answers yet. Complete an interview to see your analytics.
      </div>
    );
  }

  const radarData = [
    { skill: "Correctness", value: skillAverages.correctness ?? 0 },
    { skill: "Clarity", value: skillAverages.clarity ?? 0 },
    { skill: "Depth", value: skillAverages.depth ?? 0 },
    { skill: "Communication", value: skillAverages.communication ?? 0 },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h3 className="mb-4 font-semibold text-gray-800">Score over time</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="index" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h3 className="mb-4 font-semibold text-gray-800">Skill profile</h3>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
            <Radar
              dataKey="value"
              stroke="#4f46e5"
              fill="#6366f1"
              fillOpacity={0.5}
            />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm lg:col-span-2">
        <h3 className="mb-4 font-semibold text-gray-800">
          Rating distribution
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={distribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="band" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
