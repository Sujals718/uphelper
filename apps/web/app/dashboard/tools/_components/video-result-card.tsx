"use client";

import { useState } from "react";
import type { VideoSummary } from "@uphelper/shared-types";
import { useFlagVideoLanguage } from "@/lib/queries/videos";

function youtubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Three distinct states, not two:
//  - scoredAsOf is null            -> a scoring pass genuinely hasn't run yet
//  - scoredAsOf is set, sentimentApplied is false -> scored, but no
//    trustworthy comment sample existed, so finalScore is a penalized
//    popularity-only (views/likes) number, not a satisfaction reading
//  - scoredAsOf is set, sentimentApplied is true -> a real satisfaction %
// Previously this only checked `satisfactionScore === null`, which showed
// "Not yet scored" even for videos that WERE scored (just with no
// reliable comment sample) — a labeling bug on top of the aggregation bug
// that used to leave finalScore null in that same case.
function ScoreBar({ video }: { video: VideoSummary }) {
  if (!video.scoredAsOf) {
    return <p className="text-xs text-white/30">Scoring pending…</p>;
  }

  if (!video.sentimentApplied || video.satisfactionScore === null) {
    const pct = video.finalScore !== null ? Math.max(0, Math.min(100, Math.round(video.finalScore))) : 0;
    return (
      <div>
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>Ranked by views/likes only</span>
          <span className="text-white/60">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white/30" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-white/30">No trustworthy comment sample — score is popularity-only.</p>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round(video.satisfactionScore)));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>Satisfaction</span>
        <span className="text-white/80">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-ember-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function VideoResultCard({ video }: { video: VideoSummary }) {
  const flag = useFlagVideoLanguage();
  const [flagged, setFlagged] = useState(video.userFlaggedIncorrect);

  const isBundle = video.videoScope === "multi_problem_bundle";
  const isUncertain = video.language === null || video.languageSource === "uncertain";

  async function handleFlag() {
    await flag.mutateAsync({ id: video.id });
    setFlagged(true);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <a
          href={youtubeUrl(video.youtubeVideoId)}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-white underline-offset-4 hover:text-ember-400 hover:underline"
        >
          {video.title}
        </a>
        {isBundle && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
            Bundle video
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-white/40">
        {video.channelName} · {formatCount(video.viewCount)} views · {formatCount(video.likeCount)} likes ·{" "}
        {formatCount(video.commentCount)} comments
        {video.durationMinutes ? ` · ${Math.round(video.durationMinutes)} min` : ""}
      </p>

      {isBundle && (
        <p className="mt-2 rounded-lg bg-amber-500/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200/70">
          Covers multiple problems — satisfaction score reflects the whole video, not this problem specifically.
        </p>
      )}

      <div className="mt-3">
        <ScoreBar video={video} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-white/30">
          {video.scoredAsOf ? `Scored ${new Date(video.scoredAsOf).toLocaleString()}` : "Scoring pending"}
        </p>
        {isUncertain && !flagged && (
          <button
            onClick={handleFlag}
            disabled={flag.isPending}
            className="text-[11px] text-white/40 underline decoration-dotted hover:text-white/70"
          >
            Wrong language?
          </button>
        )}
        {flagged && <span className="text-[11px] text-emerald-300/70">Flagged for review</span>}
      </div>
    </div>
  );
}
