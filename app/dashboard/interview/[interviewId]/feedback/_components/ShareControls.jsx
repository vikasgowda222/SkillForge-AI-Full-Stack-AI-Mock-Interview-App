"use client";
import React, { useState, useTransition } from "react";
import { Share2, Check, Copy, Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enableSharing, disableSharing } from "@/lib/actions/interviews";

/**
 * Owner controls to publish / revoke a public read-only report link.
 * @param {{ mockId: string, initialShareId: string|null }} props
 */
export default function ShareControls({ mockId, initialShareId }) {
  const [shareId, setShareId] = useState(initialShareId ?? null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const shareUrl =
    shareId && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareId}`
      : null;

  const handleEnable = () =>
    startTransition(async () => {
      try {
        const { shareId: id } = await enableSharing(mockId);
        setShareId(id);
        toast.success("Public link created");
      } catch {
        toast.error("Could not create share link");
      }
    });

  const handleDisable = () =>
    startTransition(async () => {
      try {
        await disableSharing(mockId);
        setShareId(null);
        toast.success("Sharing disabled");
      } catch {
        toast.error("Could not disable sharing");
      }
    });

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!shareId) {
    return (
      <Button variant="outline" onClick={handleEnable} disabled={pending}>
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Share2 className="mr-2 h-4 w-4" />
        )}
        Share report
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        readOnly
        value={shareUrl ?? ""}
        className="w-full rounded-md border px-3 py-2 text-sm text-gray-600 sm:w-72"
        onFocus={(e) => e.target.select()}
      />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <Check className="mr-1 h-4 w-4 text-green-600" />
          ) : (
            <Copy className="mr-1 h-4 w-4" />
          )}
          Copy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisable}
          disabled={pending}
        >
          <Link2Off className="mr-1 h-4 w-4" />
          Disable
        </Button>
      </div>
    </div>
  );
}
