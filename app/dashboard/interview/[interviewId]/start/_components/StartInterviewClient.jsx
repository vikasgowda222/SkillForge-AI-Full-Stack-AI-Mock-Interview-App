"use client";
import React, { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateFollowUp } from "@/lib/actions/interviews";
import QuestionsSection from "./QuestionsSection";
import RecordAnswerSection from "./RecordAnswerSection";

export default function StartInterviewClient({ interview, questions }) {
  // Questions are stateful so an adaptive follow-up can be spliced in mid-flow.
  const [questionList, setQuestionList] = useState(questions ?? []);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  // The last answer the candidate saved — the seed for an adaptive follow-up.
  const [lastAnswered, setLastAnswered] = useState(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  const handleAnswerSave = (answered) => {
    const answeredIndex = activeQuestionIndex;
    if (answered?.question && answered?.userAnswer) {
      setLastAnswered({ index: answeredIndex, ...answered });
    }
    if (answeredIndex < questionList.length - 1) {
      setActiveQuestionIndex((prev) => prev + 1);
    }
  };

  const handleFollowUp = async () => {
    if (!lastAnswered || followUpLoading) return;
    setFollowUpLoading(true);
    try {
      const { question } = await generateFollowUp({
        mockId: interview.mockId,
        question: lastAnswered.question,
        userAnswer: lastAnswered.userAnswer,
      });

      const insertAt = lastAnswered.index + 1;
      setQuestionList((prev) => {
        const next = [...prev];
        next.splice(insertAt, 0, { question, answer: "" });
        return next;
      });
      setActiveQuestionIndex(insertAt);
      setLastAnswered(null);
      toast.success("Adaptive follow-up added to your interview");
    } catch (error) {
      toast.error("Couldn't generate a follow-up", {
        description: "Please try again in a moment.",
      });
      console.error("Follow-up error:", error);
    } finally {
      setFollowUpLoading(false);
    }
  };

  if (!questionList || questionList.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-red-500">No interview questions found.</p>
      </div>
    );
  }

  const isLastQuestion = activeQuestionIndex === questionList.length - 1;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <QuestionsSection
          mockInterviewQuestion={questionList}
          activeQuestionIndex={activeQuestionIndex}
        />
        <RecordAnswerSection
          mockInterviewQuestion={questionList}
          activeQuestionIndex={activeQuestionIndex}
          interviewData={interview}
          onAnswerSave={handleAnswerSave}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-6">
        {lastAnswered && (
          <Button
            variant="outline"
            onClick={handleFollowUp}
            disabled={followUpLoading}
          >
            {followUpLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Ask AI a follow-up
              </>
            )}
          </Button>
        )}
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
