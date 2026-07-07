"use client";

import { motion } from "framer-motion";

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

export function TabPills<T extends string>({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-white/10 bg-ink-900/50 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="relative rounded-lg px-4 py-1.5 text-sm"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-ember-500/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className={`relative z-10 ${active ? "text-ember-400" : "text-white/60 hover:text-white/90"}`}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
