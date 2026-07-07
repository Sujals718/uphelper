/**
 * Weights per the product decision: weight comment-sentiment-derived satisfaction
 * heavily, popularity (views/likes) lightly when we actually trust the
 * sentiment sample — but NEVER leave a video unranked just because it had
 * no/too-few comments. A video with real view/like counts but no usable
 * comment sample is still meaningfully rankable, just less reliably so —
 * it gets a popularity-only score with an explicit penalty multiplier so
 * it naturally sorts below a comparable video that DOES have a trusted
 * sentiment signal, rather than disappearing behind a permanent
 * "not yet scored" null.
 */
const SENTIMENT_WEIGHT = 0.8;
const POPULARITY_WEIGHT = 0.2;

// Below this many sampled comments, the sentiment sample is too thin to
// trust on its own (a single gushing or ranting comment could swing the
// whole batch) — fall back to popularity-only scoring instead of treating
// a 1-3-comment sample as equivalent to a real 50-comment read.
export const MIN_COMMENTS_FOR_SENTIMENT_WEIGHT = 4;

// Applied to the popularity score when there's no trustworthy sentiment
// signal at all (comments disabled, too few comments, or the Gemini call
// failed) — this is the "penalty" from the product decision: a
// no-comment video with the same view count as a well-reviewed one should
// rank lower, not tie with or null out against it.
export const NO_SENTIMENT_POPULARITY_MULTIPLIER = 0.5;

// Log-scale caps for normalization — a video with ~1M+ views or ~100K+
// likes maxes out its component; beyond that, more doesn't matter (the
// whole point is that raw counts shouldn't dominate a sentiment-driven
// score). Likes get a lower cap since like counts run roughly an order of
// magnitude below view counts for the same video.
const VIEW_COUNT_LOG_CAP = 6; // log10(1,000,000)
const LIKE_COUNT_LOG_CAP = 5; // log10(100,000)

// Views vs. likes within the popularity component itself: views are
// always present, likes are sometimes hidden/zero even on legitimate
// videos, so likes contribute but don't dominate.
const VIEW_SHARE_OF_POPULARITY = 0.7;
const LIKE_SHARE_OF_POPULARITY = 0.3;

export interface ScoreInputs {
  /** 0-100, or null if never scored / no comments available / Gemini failed. */
  satisfactionScore: number | null;
  /** How many comments actually went into satisfactionScore (0 if it's null). */
  sampledCommentCount: number;
  viewCount: number;
  likeCount: number;
}

export interface ScoreResult {
  /** 0-100, blended views+likes component alone (for the score-breakdown endpoint). */
  popularityScore: number;
  /**
   * 0-100 final blended score. Only null if scoring hasn't run at all yet
   * (genuinely "scoring pending" — distinct from "scored, but with no
   * reliable sentiment," which now always produces a number here).
   */
  finalScore: number;
  /** Whether the sentiment component was actually used (vs. popularity-only fallback). */
  sentimentApplied: boolean;
}

function normalizeLog(count: number, cap: number): number {
  if (count <= 0) return 0;
  const logCount = Math.log10(count + 1);
  return Math.min(100, (logCount / cap) * 100);
}

/**
 * Exported (not just used internally by computeFinalScore) so the
 * metadata-only pre-ranking step (metadata-ranking.util.ts) can reuse the
 * exact same views+likes normalization for "which candidates are worth
 * spending a Gemini call on" as is later used for the real blended score
 * — the two rankings should agree on what "popular" means.
 */
export function computePopularityScore(viewCount: number, likeCount: number): number {
  const viewScore = normalizeLog(viewCount, VIEW_COUNT_LOG_CAP);
  const likeScore = normalizeLog(likeCount, LIKE_COUNT_LOG_CAP);
  return VIEW_SHARE_OF_POPULARITY * viewScore + LIKE_SHARE_OF_POPULARITY * likeScore;
}

/**
 * Pure function — no I/O — unit-testable in isolation.
 *
 * Previously this returned `finalScore: null` whenever satisfactionScore
 * was null, which meant any video with disabled/too-few comments stayed
 * permanently unranked (shown as "Not yet scored" even long after its
 * `scoredAsOf` timestamp was set — a real bug, not the intended
 * degradation). It now always returns a usable, ordered finalScore:
 * sentiment-weighted when the comment sample is trustworthy, a penalized
 * popularity-only score otherwise. `finalScore` being null is reserved
 * exclusively for "no scoring pass has completed yet" (handled by the
 * caller, not this function — see videos.service.ts's toSummary()).
 */
export function computeFinalScore(inputs: ScoreInputs): ScoreResult {
  const popularityScore = computePopularityScore(inputs.viewCount, inputs.likeCount);

  const hasTrustworthySentiment =
    inputs.satisfactionScore !== null && inputs.sampledCommentCount >= MIN_COMMENTS_FOR_SENTIMENT_WEIGHT;

  if (hasTrustworthySentiment) {
    const finalScore =
      SENTIMENT_WEIGHT * (inputs.satisfactionScore as number) + POPULARITY_WEIGHT * popularityScore;
    return { popularityScore, finalScore: Math.round(finalScore * 100) / 100, sentimentApplied: true };
  }

  const finalScore = NO_SENTIMENT_POPULARITY_MULTIPLIER * popularityScore;
  return { popularityScore, finalScore: Math.round(finalScore * 100) / 100, sentimentApplied: false };
}
