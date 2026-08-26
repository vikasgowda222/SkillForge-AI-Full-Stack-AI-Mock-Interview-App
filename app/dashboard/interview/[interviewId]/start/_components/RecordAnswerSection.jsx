"use client";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState, useRef } from "react";
import { Mic, StopCircle, Loader2, Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
import { saveUserAnswer } from "@/lib/actions/interviews";

const RecordAnswerSection = ({
  mockInterviewQuestion,
  activeQuestionIndex,
  interviewData,
  onAnswerSave,
}) => {
  const [userAnswer, setUserAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState(null);
  const recognitionRef = useRef(null);
  const webcamRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      const recognition = recognitionRef.current;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          }
        }

        if (finalTranscript.trim()) {
          setUserAnswer((prev) => (prev + " " + finalTranscript).trim());
        }
      };

      recognition.onerror = (event) => {
        toast.error(`Speech recognition error: ${event.error}`);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };
    }

    // Stop recognition if the component unmounts mid-session.
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* recognition may not have started */
      }
    };
  }, []);

  // Attach the active MediaStream to the <video>, and stop its tracks when the
  // stream changes or the component unmounts. Capturing `video` and `stream`
  // here (instead of reading webcamRef.current inside cleanup) keeps the
  // released resource in sync with what this effect actually set up.
  useEffect(() => {
    const video = webcamRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [stream]);

  const EnableWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setStream(mediaStream);
      toast.success("Webcam enabled successfully");
    } catch (error) {
      toast.error("Failed to enable webcam", {
        description: "Please check your camera permissions",
      });
      console.error("Webcam error:", error);
    }
  };

  const DisableWebcam = () => {
    // The [stream] effect cleanup stops the tracks and clears the video source.
    setStream(null);
  };

  const StartStopRecording = () => {
    if (!recognitionRef.current) {
      toast.error("Speech-to-text is not supported in this browser");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      toast.info("Recording stopped");
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
      toast.info("Recording started");
    }
  };

  const UpdateUserAnswer = async () => {
    if (!userAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }

    // Ensure recording is stopped before we submit.
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    setLoading(true);

    try {
      const currentQuestion = mockInterviewQuestion?.[activeQuestionIndex];

      await saveUserAnswer({
        mockId: interviewData?.mockId,
        question: currentQuestion?.question,
        correctAns: currentQuestion?.answer ?? null,
        userAnswer,
      });

      toast.success("Answer recorded successfully");
      setUserAnswer("");
      onAnswerSave?.();
    } catch (error) {
      toast.error("Failed to save answer", {
        description: "Please try again in a moment.",
      });
      console.error("Answer save error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center flex-col relative">
      {loading && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex flex-col justify-center items-center">
          <Loader2 className="h-16 w-16 animate-spin text-white mb-4" />
          <p className="text-white text-lg">Saving your answer...</p>
        </div>
      )}
      <div className="flex flex-col my-20 justify-center items-center bg-black rounded-lg p-5">
        {stream ? (
          <video
            ref={webcamRef}
            autoPlay
            playsInline
            muted
            className="w-[200px] h-[200px] object-cover rounded-lg"
          />
        ) : (
          <div className="w-[200px] h-[200px] flex justify-center items-center bg-gray-200 rounded-lg">
            <p className="text-gray-500">Webcam Disabled</p>
          </div>
        )}

        <Button
          variant="outline"
          className="mt-4"
          onClick={stream ? DisableWebcam : EnableWebcam}
        >
          {stream ? (
            <>
              <CameraOff className="mr-2 h-4 w-4" /> Disable Webcam
            </>
          ) : (
            <>
              <Camera className="mr-2 h-4 w-4" /> Enable Webcam
            </>
          )}
        </Button>
      </div>

      <Button
        disabled={loading}
        variant="outline"
        className="my-10"
        onClick={StartStopRecording}
      >
        {isRecording ? (
          <h2 className="text-red-600 items-center animate-pulse flex gap-2">
            <StopCircle /> Stop Recording
          </h2>
        ) : (
          <h2 className="text-primary flex gap-2 items-center">
            <Mic /> Record Answer
          </h2>
        )}
      </Button>

      <textarea
        className="w-full h-32 p-4 mt-4 border rounded-md text-gray-800"
        placeholder="Your answer will appear here..."
        value={userAnswer}
        onChange={(e) => setUserAnswer(e.target.value)}
      />

      <Button
        className="mt-4"
        onClick={UpdateUserAnswer}
        disabled={loading || !userAnswer.trim()}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
          </>
        ) : (
          "Save Answer"
        )}
      </Button>
    </div>
  );
};

export default RecordAnswerSection;
