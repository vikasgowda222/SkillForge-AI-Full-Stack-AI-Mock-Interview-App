"use client";
import React from "react";
import { Printer } from "lucide-react";

/** Client button that triggers the browser's print / save-as-PDF dialog. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 print:hidden"
    >
      <Printer size={16} />
      Save as PDF
    </button>
  );
}
