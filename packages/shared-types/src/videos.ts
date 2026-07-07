// packages/shared-types/src/videos.ts


export type VideoScope = 'single_problem' | 'multi_problem_bundle' | 'unknown';

export type LanguageSource = 'metadata' | 'transcript' | 'user_flag' | 'uncertain';

export interface VideoSummary {
  id: string;
  youtubeVideoId: string;
  title: string;
  channelName: string;
  publishedAt: string | null;
  viewCount: number;
  commentCount: number;
  likeCount: number;
  durationMinutes: number | null;
  // null until first scored, OR when scored but no trustworthy comment
  // sample existed (see sentimentApplied) — in that second case finalScore
  // is still a real, ranked number, just popularity-only.
  satisfactionScore: number | null;
  // Only null while a scoring pass hasn't completed yet ("scoring
  // pending"). Once scored, this is always a number — a video with no/too-
  // few comments gets a penalized popularity-only score rather than
  // staying null forever.
  finalScore: number | null;
  // True if finalScore's sentiment component was actually used (a
  // trustworthy comment sample existed). False means finalScore is
  // popularity-only (views/likes), scaled down accordingly.
  sentimentApplied: boolean;
  language: string | null; // ISO 639-1 code, or null if never detected
  languageConfidence: number | null;
  languageSource: LanguageSource | null;
  videoScope: VideoScope;
  scoredAsOf: string | null; // null = never scored yet
  userFlaggedIncorrect: boolean;
}

/**
 * One language group on the results screen — top 3 videos per detected
 * language, per the build spec's "don't show one flat ranked list" call.
 * `language: null` groups videos whose language came back "uncertain."
 */
export interface VideoLanguageGroup {
  language: string | null;
  videos: VideoSummary[];
}

export interface VideoSearchResponse {
  problemName: string;
  platform: string;
  contestName: string;
  usedFallbackQuery: boolean;
  resultCompleteness: 'full' | 'partial' | 'none';
  groups: VideoLanguageGroup[];
  // Surfaced honestly per Section 10 — never hidden behind a generic
  // success response when the pipeline had to degrade.
  degraded?: {
    reason: string;
    message: string;
  };
  // Distinct from `degraded`: the search itself succeeded and returned
  // real, ranked results (metadata-only ranking never depends on
  // Gemini), but the Gemini free-tier daily quota ran out partway
  // through, so some/all of these videos may be popularity-only scored
  // rather than sentiment-scored. Present only when that's actually true
  // for this response — never silently absorbed into a generic success.
  sentimentScoringNote?: string;
}

export interface VideoSearchRequest {
  problemName: string;
  platform: string;
  contestName: string;
  problemCode: string; // e.g. "A", "1002A" — required for the primary query
}

export interface FlagLanguageRequest {
  correctedLanguage?: string; // omit if the user just knows it's wrong, not what it should be
}

export interface VideoScoreBreakdown {
  id: string;
  youtubeVideoId: string;
  satisfactionScore: number | null;
  viewWeightScore: number | null;
  /** Always a number once scored — see VideoSummary.finalScore. */
  finalScore: number | null;
  sampledCommentCount: number;
  scoredAsOf: string | null;
  videoScope: VideoScope;
  durationMinutes: number | null;
  scopeNote: string | null; // e.g. "covers problems A–D — score reflects the whole video"
  // Documented approximation, always present so the UI can show it
  // instead of presenting the score as an exact measurement.
  methodologyNote: string;
}
