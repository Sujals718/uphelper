"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useContests, useLinkPlatform, usePlatformStatus, useSyncPlatform } from "@/lib/queries/platforms";
import { AccountDisabledError, ApiError } from "@/lib/api-client";
import { cleanContestNameForSearch, extractProblemCode } from "@/lib/codeforces-format";
import { SectionHeader } from "../_components/section-header";
import { Card } from "../_components/card";
import { EmptyState } from "../_components/empty-state";
import { ProgressRing } from "../_components/progress-ring";

// Not auth-sensitive — just a public Codeforces handle — so localStorage
// is fine here. This is purely a convenience autofill for the input, not
// a source of truth: the API has no "get my linked account" endpoint (see
// PROGRESS.md), so this can't actually confirm anything is linked, it
// just saves re-typing a handle you've already used on this browser.
const HANDLE_STORAGE_KEY = "uphelper:last-cf-handle";

function codeforcesContestUrl(externalId: string): string {
  return `https://codeforces.com/contest/${externalId}`;
}

export default function ContestsPage() {
  const contests = useContests();
  const status = usePlatformStatus();
  const link = useLinkPlatform();
  const sync = useSyncPlatform();

  const [handle, setHandle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(HANDLE_STORAGE_KEY);
    if (stored) setHandle(stored);
  }, []);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await link.mutateAsync({ handle });
      window.localStorage.setItem(HANDLE_STORAGE_KEY, handle);
      await sync.mutateAsync();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't verify that handle.");
    }
  }

  async function handleSync() {
    setFormError(null);
    try {
      await sync.mutateAsync();
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 404
          ? "Link a Codeforces handle first."
          : "Sync failed — try again in a moment.",
      );
    }
  }

  return (
    <div>
      <SectionHeader
        title="Codeforces history"
        subtitle="Every contest you've attended, with exactly where you got stuck."
        action={
          <div className="flex items-center gap-2 text-xs text-white/40">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status.data?.codeforces.reachable ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            {status.data?.codeforces.reachable ? "Codeforces reachable" : "Codeforces unreachable"}
          </div>
        }
      />

      <Card className="mb-8">
        <form onSubmit={handleLink} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-white/50">Codeforces handle</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="tourist"
              className="w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2"
            />
          </div>
          <button
            type="submit"
            disabled={link.isPending || sync.isPending || !handle}
            className="rounded-lg bg-ember-500 px-5 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
          >
            {link.isPending ? "Linking…" : "Link & sync"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={sync.isPending}
            className="rounded-lg border border-white/10 px-5 py-2 text-sm text-white/70 transition-colors hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            {sync.isPending ? "Syncing…" : "Re-sync"}
          </button>
        </form>
        {formError && <p className="mt-3 text-sm text-red-400">{formError}</p>}
        <p className="mt-3 text-xs text-white/30">
          Not sure if a handle&apos;s already linked? Re-sync is safe to click any time — the API doesn&apos;t expose
          a way to check ahead of time, so it just tells you plainly if nothing&apos;s linked yet. The field above
          just remembers the last handle you typed on this browser, for convenience.
        </p>
      </Card>

      {contests.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink-900/50" />
          ))}
        </div>
      ) : contests.error instanceof AccountDisabledError ? (
        <EmptyState title="Account has been disabled." description="Contact support if you think this is a mistake." />
      ) : !contests.data?.length ? (
        <EmptyState
          title="No contests synced yet"
          description="Link your Codeforces handle above and hit sync to pull in your full contest history."
        />
      ) : (
        <div className="grid gap-3">
          <AnimatePresence>
            {contests.data.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.3) }}
              >
                <Card className="flex items-center gap-4">
                  <ProgressRing solved={c.problemsSolved} total={c.totalProblems} />
                  <div className="flex-1">
                    <a
                      href={codeforcesContestUrl(c.contest.externalId)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-white underline-offset-4 hover:text-ember-400 hover:underline"
                    >
                      {c.contest.name}
                    </a>
                    <p className="mt-0.5 text-xs text-white/40">
                      {c.contest.startTime ? new Date(c.contest.startTime).toLocaleDateString() : "Date unknown"}
                    </p>
                  </div>
                  {c.unsolvedProblem ? (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <a
                        href={c.unsolvedProblem.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
                      >
                        Unsolved: {c.unsolvedProblem.name}
                      </a>
                      <Link
                        href={`/dashboard/tools?tab=video&contestName=${encodeURIComponent(
                          cleanContestNameForSearch(c.contest.name),
                        )}&problemName=${encodeURIComponent(c.unsolvedProblem.name)}&problemCode=${encodeURIComponent(
                          extractProblemCode(c.unsolvedProblem.externalId),
                        )}`}
                        className="text-[11px] text-white/40 hover:text-ember-400"
                      >
                        Find a video →
                      </Link>
                    </div>
                  ) : (
                    <span className="shrink-0 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                      Full clear
                    </span>
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}