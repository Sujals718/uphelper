"use client";

import { useState } from "react";
import { motion } from "framer-motion";

// Labels for the classic SM-2 0-5 quality-of-recall scale — same scale
// `calculateSm2` assumes server-side (see revision/sm2.util.ts). Grades
// below 3 count as a failed recall and reset the streak.
const GRADES = [
  { value: 0, label: "Blackout", color: "bg-red-500/15 text-red-300 hover:bg-red-500/25" },
  { value: 1, label: "Wrong", color: "bg-red-500/10 text-red-300 hover:bg-red-500/20" },
  { value: 2, label: "Wrong, close", color: "bg-orange-500/10 text-orange-300 hover:bg-orange-500/20" },
  { value: 3, label: "Hard", color: "bg-yellow-500/10 text-yellow-200 hover:bg-yellow-500/20" },
  { value: 4, label: "Good", color: "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" },
  { value: 5, label: "Easy", color: "bg-ember-500/15 text-ember-300 hover:bg-ember-500/25" },
] as const;

/**
 * Two-step by design: picking a grade doesn't fire the review immediately
 * — it arms a confirm bar naming exactly what's about to happen, since
 * grading rewrites SM-2 state (interval/ease factor/next review date).
 * `onConfirm` only fires once the user explicitly confirms; `Cancel`
 * (or picking a different grade) just re-arms the picker.
 */
export function GradePicker({ onConfirm, disabled }: { onConfirm: (grade: number) => void; disabled?: boolean }) {
  const [pendingGrade, setPendingGrade] = useState<number | null>(null);

  if (pendingGrade !== null) {
    const grade = GRADES.find((g) => g.value === pendingGrade)!;
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-3"
      >
        <span className="text-xs text-white/60">
          Grade this as <span className="font-medium text-white">{grade.label}</span>?
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onConfirm(pendingGrade);
            setPendingGrade(null);
          }}
          className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setPendingGrade(null)}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white"
        >
          Cancel
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {GRADES.map((g) => (
        <motion.button
          key={g.value}
          type="button"
          whileTap={{ scale: 0.94 }}
          disabled={disabled}
          onClick={() => setPendingGrade(g.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${g.color}`}
        >
          {g.label}
        </motion.button>
      ))}
    </div>
  );
}
