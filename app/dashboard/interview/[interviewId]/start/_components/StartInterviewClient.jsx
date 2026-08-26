"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import QuestionsSection from "./QuestionsSection";
import RecordAnswerSection from "./RecordAnswerSection";

export default function StartInterviewClient({ interview, questions }) {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  const handleAnswerSave = () => {
    if (activeQuestionIndex < questions.length - 1) {
      setActiveQuestionIndex((prev) => prev + 1);
    }
  };

  if (!questions || questions.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-red-500">No interview questions found.</p>
      </div>
    );
  }

  const isLastQuestion = activeQuestionIndex === questions.length - 1;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <QuestionsSection
          mockInterviewQuestion={questions}
          activeQuestionIndex={activeQuestionIndex}
        />
        <RecordAnswerSection
          mockInterviewQuestion={questions}
          activeQuestionIndex={activeQuestionIndex}
          interviewData={interview}
          onAnswerSave={handleAnswerSave}
        />
      </div>
      <div className="flex justify-end gap-6">
        {activeQuestionIndex > 0 && (
          <Button
            onClick={() => setActiveQuestionIndex(activeQuestionIndex - 1)}
          >
            Previous Question
          </Button>
        )}
        {!isLastQuestion && (
          <Button
            onClick={() => setActiveQuestionIndex(activeQuestionIndex + 1)}
          >
            Next Question
          </Button>
        )}
        {isLastQuestion && (
          <Link href={`/dashboard/interview/${interview.mockId}/feedback`}>
            <Button>End Interview</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
