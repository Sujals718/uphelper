"use client";

import { motion } from "framer-motion";
import { useWeaknessHeatmap } from "@/lib/queries/analytics";
import { SectionHeader } from "../_components/section-header";
import { Card } from "../_components/card";
import { EmptyState } from "../_components/empty-state";

export default function AnalyticsPage() {
  const heatmap = useWeaknessHeatmap();
  const maxTotal = Math.max(1, ...(heatmap.data?.map((e) => e.total) ?? [1]));

  return (
    <div>
      <SectionHeader
        title="Weakness heatmap"
        subtitle="Every tag from your logged mistakes and your unsolved contest problems, ranked by how often it shows up."
      />

      {heatmap.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-ink-900/50" />
          ))}
        </div>
      ) : !heatmap.data?.length ? (
        <EmptyState
          title="Nothing to show yet"
          description="Log a few mistakes or sync a contest with an unsolved problem, and tags will start showing up here."
        />
      ) : (
        <Card>
          <div className="mb-4 flex items-center gap-4 text-xs text-white/50">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-ember-500" /> Mistakes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> Unsolved problems
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {heatmap.data.map((entry, i) => {
              const mistakePct = (entry.mistakeCount / maxTotal) * 100;
              const unsolvedPct = (entry.unsolvedCount / maxTotal) * 100;
              return (
                <motion.div
                  key={entry.tag}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.6) }}
                  className="flex items-center gap-3"
                >
                  <span className="w-28 shrink-0 truncate text-sm text-white/80" title={entry.tag}>
                    {entry.tag}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-white/5">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-ember-500/80"
                      initial={{ width: 0 }}
                      animate={{ width: `${mistakePct}%` }}
                      transition={{ duration: 0.5, delay: Math.min(i * 0.03, 0.6) }}
                    />
                    <motion.div
                      className="absolute inset-y-0 bg-blue-400/80"
                      style={{ left: `${mistakePct}%` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${unsolvedPct}%` }}
                      transition={{ duration: 0.5, delay: Math.min(i * 0.03, 0.6) }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm text-white/50">{entry.total}</span>
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}