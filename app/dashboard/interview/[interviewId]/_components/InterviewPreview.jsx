"use client";
import { Button } from "@/components/ui/button";
import { Lightbulb, WebcamIcon } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import Webcam from "react-webcam";
import { toast } from "sonner";

export default function InterviewPreview({ interview }) {
  const [webCamEnabled, setWebCamEnabled] = useState(false);

  const handleWebcamToggle = () => {
    if (!webCamEnabled) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then(() => {
          setWebCamEnabled(true);
          toast.success("Webcam and microphone enabled");
        })
        .catch((error) => {
          toast.error("Failed to access webcam or microphone");
          console.error("Webcam access error:", error);
        });
    } else {
      setWebCamEnabled(false);
    }
  };

  return (
    <div className="my-10">
      <h2 className="font-bold text-2xl">Let&apos;s get started</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="flex flex-col my-5 gap-5">
          <div className="flex flex-col p-5 rounded-lg border gap-5">
            <h2 className="text-lg">
              <strong>Job Role/Job Position: </strong>
              {interview.jobPosition}
            </h2>
            <h2 className="text-lg">
              <strong>Job Description/Tech Stack: </strong>
              {interview.jobDesc}
            </h2>
            <h2 className="text-lg">
              <strong>Years of Experience: </strong>
              {interview.jobExperience}
            </h2>
          </div>
          <div className="p-5 border rounded-lg border-yellow-300 bg-yellow-100">
            <h2 className="flex gap-2 items-center text-yellow-500">
              <Lightbulb />
              <span>Information</span>
            </h2>
            <h2 className="mt-3 text-yellow-500">
              Enable your webcam and microphone to start your AI-generated mock
              interview. It has 5 questions which you can answer, and it will
              provide a report based on your answers. Your video is never
              recorded, and webcam access can be disabled at any time.
            </h2>
          </div>
        </div>
        <div>
          {webCamEnabled ? (
            <Webcam
              mirrored={true}
              style={{ height: 300, width: "auto" }}
              onUserMedia={() => setWebCamEnabled(true)}
              onUserMediaError={() => {
                toast.error("Webcam access error");
                setWebCamEnabled(false);
              }}
            />
          ) : (
            <>
              <WebcamIcon className="h-72 my-7 border rounded-lg w-full p-20 bg-secondary" />
              <Button
                className="w-full"
                variant="ghost"
                onClick={handleWebcamToggle}
              >
                Enable Web Cam and Microphone
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex justify-end items-end">
        <Link href={`/dashboard/interview/${interview.mockId}/start`}>
          <Button>Start Interview</Button>
        </Link>
      </div>
    </div>
  );
}
