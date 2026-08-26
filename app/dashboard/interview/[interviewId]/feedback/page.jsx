import { notFound } from "next/navigation";
import { getFeedback } from "@/lib/actions/interviews";
import FeedbackView from "./_components/FeedbackView";

export default async function FeedbackPage({ params }) {
  const { interview, answers } = await getFeedback(params.interviewId);
  if (!interview) notFound();

  return <FeedbackView answers={answers} />;
}
