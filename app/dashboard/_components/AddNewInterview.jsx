"use client";
import React, { useState } from "react";
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
import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createInterview } from "@/lib/actions/interviews";

// Job Role Suggestions
const JOB_ROLE_SUGGESTIONS = [
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "Software Engineer",
  "DevOps Engineer",
  "Data Scientist",
  "Machine Learning Engineer",
  "Cloud Engineer",
  "Mobile App Developer",
  "UI/UX Designer",
];

// Tech Stack Suggestions
const TECH_STACK_SUGGESTIONS = {
  "Full Stack Developer": "React, Node.js, Express, MongoDB, TypeScript",
  "Frontend Developer": "React, Vue.js, Angular, TypeScript, Tailwind CSS",
  "Backend Developer": "Python, Django, Flask, Java Spring, PostgreSQL",
  "Software Engineer": "Java, C++, Python, AWS, Microservices",
  "DevOps Engineer": "Docker, Kubernetes, Jenkins, AWS, Azure",
  "Data Scientist": "Python, TensorFlow, PyTorch, Pandas, NumPy",
  "Machine Learning Engineer": "Python, scikit-learn, Keras, TensorFlow",
  "Cloud Engineer": "AWS, Azure, GCP, Terraform, Kubernetes",
  "Mobile App Developer": "React Native, Flutter, Swift, Kotlin",
  "UI/UX Designer": "Figma, Sketch, Adobe XD, InVision",
};

function AddNewInterview() {
  const [openDialog, setOpenDialog] = useState(false);
  const [jobPosition, setJobPosition] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobExperience, setJobExperience] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const autoSuggestTechStack = (role) => {
    const suggestion = TECH_STACK_SUGGESTIONS[role];
    if (suggestion) {
      setJobDescription(suggestion);
      toast.info(`Auto-filled tech stack for ${role}`);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { mockId } = await createInterview({
        jobPosition,
        jobDescription,
        jobExperience,
      });

      toast.success("Interview questions generated successfully!");
      setOpenDialog(false);
      router.push(`/dashboard/interview/${mockId}`);
    } catch (error) {
      console.error("Error generating interview:", error);
      toast.error("Failed to generate interview questions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        className="p-10 border rounded-lg bg-secondary hover:scale-105 hover:shadow-md cursor-pointer transition-all"
        onClick={() => setOpenDialog(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpenDialog(true);
        }}
      >
        <h1 className="font-bold text-lg text-center">+ Add New</h1>
      </div>
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-2xl">
              Create Your Interview Preparation
            </DialogTitle>
            <DialogDescription>
              Tell us about the role and we&apos;ll generate tailored questions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit}>
            <div>
              <div className="mt-7 my-3">
                <label htmlFor="jobPosition">Job Role/Position</label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="jobPosition"
                    placeholder="Ex. Full Stack Developer"
                    value={jobPosition}
                    required
                    onChange={(e) => setJobPosition(e.target.value)}
                    list="jobRoles"
                  />
                  <datalist id="jobRoles">
                    {JOB_ROLE_SUGGESTIONS.map((role) => (
                      <option key={role} value={role} />
                    ))}
                  </datalist>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => autoSuggestTechStack(jobPosition)}
                    disabled={!jobPosition}
                    aria-label="Auto-suggest tech stack"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="my-3">
                <label htmlFor="jobDescription">
                  Job Description/Tech Stack
                </label>
                <Textarea
                  id="jobDescription"
                  placeholder="Ex. React, Angular, NodeJs, MySql etc"
                  value={jobDescription}
                  required
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>
              <div className="my-3">
                <label htmlFor="jobExperience">Years of Experience</label>
                <Input
                  id="jobExperience"
                  placeholder="Ex. 5"
                  type="number"
                  min="0"
                  max="70"
                  value={jobExperience}
                  required
                  onChange={(e) => setJobExperience(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-5 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpenDialog(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="animate-spin mr-2" /> Generating
                  </>
                ) : (
                  "Start Interview"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AddNewInterview;
