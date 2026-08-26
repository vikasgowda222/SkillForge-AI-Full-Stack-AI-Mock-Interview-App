import React from "react";
import { currentUser } from "@clerk/nextjs/server";
import { Bot, ListChecks, Trophy, TrendingUp, Zap } from "lucide-react";

import AddNewInterview from "./_components/AddNewInterview";
import InterviewList from "./_components/InterviewList";
import { getDashboardStats, getMyInterviews } from "@/lib/actions/interviews";

export default async function Dashboard() {
  const [user, stats, interviews] = await Promise.all([
    currentUser(),
    getDashboardStats(),
    getMyInterviews(),
  ]);

  const statsCards = [
    {
      icon: <ListChecks size={32} className="text-indigo-600" />,
      title: "Total Interviews",
      value: String(stats.totalInterviews),
    },
    {
      icon: <Trophy size={32} className="text-green-600" />,
      title: "Best Score",
      value: stats.bestScore != null ? `${stats.bestScore}/10` : "N/A",
    },
    {
      icon: <TrendingUp size={32} className="text-blue-600" />,
      title: "Average Score",
      value: stats.averageScore != null ? `${stats.averageScore}/10` : "N/A",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* User Greeting */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Bot className="text-indigo-600" size={32} />
            Dashboard
          </h2>
          <h3 className="text-lg sm:text-xl text-gray-600 mt-2">
            Welcome, {user?.firstName || "Interviewer"}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-sm sm:text-base">
            {user?.primaryEmailAddress?.emailAddress || ""}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {statsCards.map((card) => (
          <div
            key={card.title}
            className="bg-white p-4 sm:p-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center"
          >
            {card.icon}
            <div className="ml-4">
              <p className="text-xs sm:text-sm text-gray-500">{card.title}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800">
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Create Interview Section */}
      <div className="bg-gray-50 p-4 sm:p-6 rounded-lg">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 space-y-4 sm:space-y-0">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 flex items-center gap-3">
            <Zap size={24} className="text-yellow-500" />
            Create AI Mock Interview
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <AddNewInterview />
        </div>
      </div>

      {/* Interview History */}
      <div className="mt-8">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-6">
          Interview History
        </h2>
        <InterviewList interviews={interviews} />
      </div>
    </div>
  );
}
