import { computePopularityScore } from './score-aggregation.util';


export interface MetadataRankInput {
  id: string;
  viewCount: number;
  likeCount: number;
  publishedAt: Date | null;
  durationMinutes: number | null;
  videoScope: 'single_problem' | 'multi_problem_bundle' | 'unknown';
}


const SCOPE_BONUS: Record<MetadataRankInput['videoScope'], number> = {
  single_problem: 6,
  unknown: 0,
  multi_problem_bundle: -3,
};

// A very small recency nudge — a newer video is somewhat more likely to
// reflect current best practice/consensus, but this should never come
// close to outweighing a real popularity gap, hence the small weight and
// hard cap.
const RECENCY_BONUS_CAP = 4;
const RECENCY_FULL_BONUS_WITHIN_DAYS = 30;

function recencyBonus(publishedAt: Date | null): number {
  if (!publishedAt) return 0;
  const ageDays = (Date.now() - publishedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return RECENCY_BONUS_CAP;
  if (ageDays >= RECENCY_FULL_BONUS_WITHIN_DAYS * 12) return 0; // stops mattering after ~1 year
  return Math.max(0, RECENCY_BONUS_CAP * (1 - ageDays / (RECENCY_FULL_BONUS_WITHIN_DAYS * 12)));
}

/** 0-100-ish (can exceed slightly via bonuses) — for RANKING only, never stored as a real user-facing score. */
export function metadataOnlyRankScore(input: MetadataRankInput): number {
  const popularity = computePopularityScore(input.viewCount, input.likeCount);
  return popularity + SCOPE_BONUS[input.videoScope] + recencyBonus(input.publishedAt);
}

/**
 * Sorts candidates within a single language group by metadata-only rank
 * score (descending) and returns the top `limit` — these are the ONLY
 * candidates that should be considered for a Gemini sentiment call.
 * Everything else in the group is dropped before scoring ever happens,
 * since it would never be shown to the user anyway (the results screen
 * only ever displays the top `limit` videos per language group).
 */
export function selectTopCandidatesByMetadata<T extends MetadataRankInput>(candidates: T[], limit: number): T[] {
  return [...candidates]
    .sort((a, b) => metadataOnlyRankScore(b) - metadataOnlyRankScore(a))
    .slice(0, limit);
}
