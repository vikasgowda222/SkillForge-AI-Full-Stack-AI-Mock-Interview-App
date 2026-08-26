"use client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Trash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInterview } from "@/lib/actions/interviews";

const InterviewItemCard = ({ interview }) => {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onStart = () => {
    router.push(`/dashboard/interview/${interview?.mockId}`);
  };

  const onFeedbackPress = () => {
    router.push(`/dashboard/interview/${interview?.mockId}/feedback`);
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await deleteInterview(interview.mockId);
      setIsDialogOpen(false);
      toast.success("Interview deleted successfully");
      router.refresh();
    } catch (error) {
      console.error("Error deleting interview:", error);
      toast.error("Failed to delete interview");
    } finally {
      setDeleting(false);
    }
  };

  const createdLabel = interview?.createdAt
    ? new Date(interview.createdAt).toLocaleDateString()
    : "—";

  return (
    <div className="relative border shadow-sm rounded-sm p-3">
      {/* Delete button in the top-right corner */}
      <Button
        size="sm"
        variant="outline"
        className="absolute top-2 right-2 flex items-center justify-center"
        onClick={() => setIsDialogOpen(true)}
        aria-label="Delete interview"
      >
        <Trash className="text-red-600" />
      </Button>

      {/* Card Content */}
      <div>
        <h2 className="font-bold text-primary">{interview?.jobPosition}</h2>
        <h2 className="text-sm text-gray-500">
          Experience: {interview?.jobExperience} Year(s)
        </h2>
        <h2 className="text-sm text-gray-500">Created At: {createdLabel}</h2>
      </div>

      <div className="flex justify-between gap-5 mt-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onFeedbackPress}
        >
          Feedback
        </Button>
        <Button className="w-full" size="sm" onClick={onStart}>
          Start
        </Button>
      </div>

      {/* Confirmation Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Confirm Deletion</h3>
            <p className="mb-4">
              Are you sure you want to delete this interview? This also removes
              its recorded answers and feedback.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting
                  </>
                ) : (
                  "Confirm Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewItemCard;
