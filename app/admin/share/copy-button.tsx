"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy link",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (insecure origin, permissions). The link is
      // visible on screen anyway, so failing quietly is better than an alert.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
