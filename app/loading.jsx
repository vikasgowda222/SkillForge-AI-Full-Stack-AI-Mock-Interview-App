import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-indigo-600" />
        <p className="mt-4 text-gray-600">Loading…</p>
      </div>
    </div>
  );
}
