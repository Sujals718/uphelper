"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { VideoSearchResponse } from "@uphelper/shared-types";
import { useSearchVideos } from "@/lib/queries/videos";
import { useGetDebugPrompt, useGetHintPrompt } from "@/lib/queries/prompts";
import { ApiError } from "@/lib/api-client";
import { languageDisplayName } from "@/lib/language-names";
import { SectionHeader } from "../_components/section-header";
import { Card } from "../_components/card";
import { EmptyState } from "../_components/empty-state";
import { TabPills } from "./_components/tab-pills";
import { CopyButton } from "./_components/copy-button";
import { VideoResultCard } from "./_components/video-result-card";

const PLATFORM = "Codeforces";

type Tab = "video" | "hint" | "debug";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none ring-ember-500/50 focus:ring-2";

function ToolsPageInner() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("video");
  const [problemName, setProblemName] = useState("");
  const [contestName, setContestName] = useState("");
  const [problemCode, setProblemCode] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [userCode, setUserCode] = useState("");

  // Prefill from a deep link, e.g. the Contests page's unsolved-problem
  // badge linking straight here with the problem already filled in —
  // real cross-feature integration, not three disconnected tools.
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "video" || t === "hint" || t === "debug") setTab(t);
    const pn = searchParams.get("problemName");
    const cn = searchParams.get("contestName");
    const pc = searchParams.get("problemCode");
    if (pn) setProblemName(pn);
    if (cn) setContestName(cn);
    if (pc) setProblemCode(pc);
    // Only meant to run once, off the URL this page was opened with — not
    // on every searchParams identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchVideos = useSearchVideos();
  const hintPrompt = useGetHintPrompt();
  const debugPrompt = useGetDebugPrompt();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "video") {
      await searchVideos.mutateAsync({ problemName, platform: PLATFORM, contestName, problemCode });
    } else if (tab === "hint") {
      await hintPrompt.mutateAsync({
        problemName,
        platform: PLATFORM,
        contestName,
        problemStatement: problemStatement || undefined,
      });
    } else {
      await debugPrompt.mutateAsync({ problemName, platform: PLATFORM, contestName, userCode });
    }
  }

  const activeMutation = tab === "video" ? searchVideos : tab === "hint" ? hintPrompt : debugPrompt;
  const canSubmit =
    problemName.trim() &&
    contestName.trim() &&
    (tab !== "video" || problemCode.trim()) &&
    (tab !== "debug" || userCode.trim());

  return (
    <div>
      <SectionHeader
        title="Tools"
        subtitle="Find the best explanation for a problem, or generate a portable hint/debug prompt for your own AI."
      />

      <TabPills
        layoutId="tools-active-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "video", label: "Find a video" },
          { value: "hint", label: "Hint prompt" },
          { value: "debug", label: "Debug prompt" },
        ]}
      />

      <Card className="mb-8 mt-4">
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Platform</label>
            <input value={PLATFORM} disabled className={`${inputClass} opacity-50`} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Contest name</label>
            <input
              value={contestName}
              onChange={(e) => setContestName(e.target.value)}
              placeholder="Codeforces Round 1002"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Problem name</label>
            <input
              value={problemName}
              onChange={(e) => setProblemName(e.target.value)}
              placeholder="Two Arrays"
              className={inputClass}
            />
          </div>
          {tab === "video" && (
            <div>
              <label className="mb-1.5 block text-xs text-white/50">Problem code</label>
              <input
                value={problemCode}
                onChange={(e) => setProblemCode(e.target.value)}
                placeholder="A"
                className={inputClass}
              />
            </div>
          )}
          {tab === "hint" && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs text-white/50">Problem statement (optional)</label>
              <textarea
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                rows={3}
                placeholder="Paste the problem statement if you want the hint to be more targeted"
                className={`${inputClass} resize-none`}
              />
            </div>
          )}
          {tab === "debug" && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs text-white/50">Your code</label>
              <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                rows={8}
                placeholder="Paste your current attempt"
                className={`${inputClass} resize-none font-mono text-xs`}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!canSubmit || activeMutation.isPending}
              className="rounded-lg bg-ember-500 px-5 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-ember-400 disabled:opacity-40"
            >
              {activeMutation.isPending
                ? tab === "video"
                  ? "Scoring videos…"
                  : "Working…"
                : tab === "video"
                  ? "Find videos"
                  : "Generate prompt"}
            </button>
          </div>
        </form>
        {activeMutation.isError && (
          <p className="mt-3 text-sm text-red-400">
            {activeMutation.error instanceof ApiError ? activeMutation.error.message : "Something went wrong — try again."}
          </p>
        )}
      </Card>

      {tab === "video" && <VideoResultsPanel result={searchVideos.data} isPending={searchVideos.isPending} />}
      {tab === "hint" && <PromptResultPanel text={hintPrompt.data?.filledText} isPending={hintPrompt.isPending} />}
      {tab === "debug" && <PromptResultPanel text={debugPrompt.data?.filledText} isPending={debugPrompt.isPending} />}
    </div>
  );
}

function VideoResultsPanel({ result, isPending }: { result: VideoSearchResponse | undefined; isPending: boolean }) {
  if (isPending) {
    // The backend now waits for the ENTIRE scoring pipeline (search ->
    // filter -> language detection -> comments -> Gemini sentiment ->
    // final score -> language grouping) to finish before responding, so
    // this can genuinely take 30-90s (occasionally a bit more). A silent
    // skeleton for that long reads as broken, so this sets an explicit
    // expectation instead of pretending it'll be instant.
    return (
      <div>
        <p className="mb-4 text-center text-xs text-white/40">
          Scoring every candidate video before showing results — this can take up to a minute or two. Quality over
          speed.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-ink-900/50" />
          ))}
        </div>
      </div>
    );
  }

  if (!result) return null;

  if (result.groups.length === 0) {
    return (
      <EmptyState
        title="No videos found"
        description={
          result.degraded?.message ??
          "Nothing matched this problem, even after the broader contest-level fallback search."
        }
      />
    );
  }

  return (
    <div>
      {result.usedFallbackQuery && (
        <p className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
          No exact match for this problem — showing broader &ldquo;{result.contestName} solutions&rdquo; results
          instead. These may cover the whole contest rather than this problem alone.
        </p>
      )}
      {result.sentimentScoringNote && (
        <p className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/70">
          {result.sentimentScoringNote}
        </p>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <AnimatePresence>
          {result.groups.map((group, gi) => (
            <motion.div
              key={group.language ?? "uncertain"}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: gi * 0.05 }}
            >
              <Card>
                 <p className="mb-3 font-display text-sm text-white/80">{languageDisplayName(group.language)}</p>
                <div className="flex flex-col gap-3">
                  {group.videos.map((video) => (
                    <VideoResultCard key={video.id} video={video} />
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PromptResultPanel({ text, isPending }: { text: string | undefined; isPending: boolean }) {
  if (isPending) {
    return <div className="h-64 animate-pulse rounded-2xl bg-ink-900/50" />;
  }

  if (!text) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm text-white/80">Ready to paste into your own AI</p>
          <CopyButton text={text} />
        </div>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-4 text-xs leading-relaxed text-white/80">
          {text}
        </pre>
      </Card>
    </motion.div>
  );
}

export default function ToolsPage() {
  return (
    <Suspense fallback={null}>
      <ToolsPageInner />
    </Suspense>
  );
}
