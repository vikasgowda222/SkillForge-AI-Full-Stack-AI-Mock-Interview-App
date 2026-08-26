import { notFound } from "next/navigation";
import { getInterviewById } from "@/lib/actions/interviews";
import InterviewPreview from "./_components/InterviewPreview";

export default async function InterviewPage({ params }) {
  const interview = await getInterviewById(params.interviewId);
  if (!interview) notFound();

  return <InterviewPreview interview={interview} />;
}
