"use client";
import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Github, LoaderCircle, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createInterviewFromGitHub,
  createInterviewFromResume,
  parseResumePdf,
} from "@/lib/actions/interviews";

/**
 * Create an interview personalized from a resume (PDF upload or pasted text)
 * or from a public GitHub profile.
 */
export default function PersonalizedInterview() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("resume"); // "resume" | "github"
  const [jobPosition, setJobPosition] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);
  const router = useRouter();

  const done = (mockId) => {
    toast.success("Personalized interview generated!");
    setOpen(false);
    router.push(`/dashboard/interview/${mockId}`);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF resume.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const { text } = await parseResumePdf(fd);
      setResumeText(text);
      toast.success("Resume text extracted — review and generate.");
    } catch {
      toast.error("Could not read that PDF. Paste your resume text instead.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!jobPosition.trim()) {
      toast.error("Enter a target role.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "resume") {
        const { mockId } = await createInterviewFromResume({
          resumeText,
          jobPosition,
        });
        done(mockId);
      } else {
        const { mockId } = await createInterviewFromGitHub({
          username,
          jobPosition,
        });
        done(mockId);
      }
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("NOT_FOUND")) toast.error("GitHub user not found.");
      else if (msg.includes("RATE_LIMITED"))
        toast.error("GitHub rate limit reached — try again later.");
      else if (msg.includes("resumeText"))
        toast.error("Add more resume detail (at least a few lines).");
      else toast.error("Could not generate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const tabBtn = (value, icon, label) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
        mode === value
          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
          : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div>
      <div
        className="flex h-full cursor-pointer flex-col items-center justify-center rounded-lg border bg-gradient-to-br from-indigo-50 to-purple-50 p-10 transition-all hover:scale-105 hover:shadow-md"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(true);
        }}
      >
        <Wand2 className="mb-2 h-6 w-6 text-indigo-600" />
        <h1 className="text-center text-lg font-bold">Personalized</h1>
        <p className="text-center text-xs text-gray-500">Resume or GitHub</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Personalized Interview
            </DialogTitle>
            <DialogDescription>
              Generate questions grounded in your real background.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4 flex gap-2">
            {tabBtn("resume", <FileText className="h-4 w-4" />, "From Resume")}
            {tabBtn("github", <Github className="h-4 w-4" />, "From GitHub")}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="pi-role" className="text-sm font-medium">
                Target role
              </label>
              <Input
                id="pi-role"
                placeholder="Ex. Senior Backend Engineer"
                value={jobPosition}
                onChange={(e) => setJobPosition(e.target.value)}
                required
              />
            </div>

            {mode === "resume" ? (
              <>
                <div>
                  <label className="text-sm font-medium">Upload PDF</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handleFile}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white hover:file:bg-indigo-700"
                  />
                </div>
                <div>
                  <label htmlFor="pi-resume" className="text-sm font-medium">
                    …or paste resume text
                  </label>
                  <Textarea
                    id="pi-resume"
                    rows={6}
                    placeholder="Paste your resume / experience here"
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="pi-gh" className="text-sm font-medium">
                  GitHub username
                </label>
                <Input
                  id="pi-gh"
                  placeholder="Ex. torvalds"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Uses your public profile, top repos, and languages.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="mr-2 animate-spin" /> Working
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
