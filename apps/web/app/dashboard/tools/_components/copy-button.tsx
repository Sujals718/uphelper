"use client";

import { useState } from "react";

// Per the build spec's Phase 4: "a form that fills placeholders and a
// 'Copy Prompt' button. Do not make the user hand-edit placeholders." —
// this is that button. The transient "Copied!" state is the only feedback
// a clipboard write gets; there's no server round-trip to show a spinner
// for.
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className="rounded-lg bg-ember-500 px-4 py-1.5 text-xs font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
    >
      {copied ? "Copied!" : "Copy prompt"}
    </button>
  );
}
