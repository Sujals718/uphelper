"use client";

import { motion } from "framer-motion";

export function StatCard({
  label,
  value,
  hint,
  delay = 0,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/10 bg-ink-900/50 p-5"
    >
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-2 font-display text-3xl text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </motion.div>
  );
}
