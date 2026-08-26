import React from "react";
import Link from "next/link";
import { BarChart3, ArrowLeft } from "lucide-react";
import { getAnalytics } from "@/lib/actions/interviews";
import AnalyticsCharts from "@/components/analytics/AnalyticsCharts";

export const metadata = {
  title: "Analytics — SkillForge AI",
  description: "Your interview performance analytics and skill breakdown.",
};

export default async function AnalyticsPage() {
  const analytics = await getAnalytics();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-800 sm:text-3xl">
            <BarChart3 className="text-indigo-600" size={32} />
            Analytics
          </h1>
          <p className="mt-2 text-gray-600">
            {analytics.totalScored} scored answer
            {analytics.totalScored === 1 ? "" : "s"} across your interviews.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
      </div>

      <AnalyticsCharts analytics={analytics} />
    </div>
  );
}
