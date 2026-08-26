import { notFound } from "next/navigation";
import { getInterviewById } from "@/lib/actions/interviews";
import StartInterviewClient from "./_components/StartInterviewClient";

export default async function StartInterviewPage({ params }) {
  const interview = await getInterviewById(params.interviewId);
  if (!interview) notFound();

  let questions = [];
  try {
    const parsed = JSON.parse(interview.jsonMockResp);
    if (Array.isArray(parsed)) questions = parsed;
  } catch {
    questions = [];
  }

  return <StartInterviewClient interview={interview} questions={questions} />;
}
