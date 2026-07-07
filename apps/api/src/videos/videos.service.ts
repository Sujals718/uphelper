import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import type {
  VideoLanguageGroup,
  VideoScoreBreakdown,
  VideoScope,
  VideoSearchResponse,
  VideoSummary,
} from '@uphelper/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeClient } from '../youtube/youtube-client.service';
import { LanguageDetectionService } from './language-detection.service';
import { inferVideoScope, parseIso8601DurationToMinutes, scopeNoteFor } from './video-scope.util';
import { matchesSearchQuery } from './query-relevance.util';
import { selectTopCandidatesByMetadata } from './metadata-ranking.util';
import { RedisService } from '../redis/redis.service';
import { GeminiClient } from '../gemini/gemini-client.service';


const FRESH_HOURS = 5;
const STALE_HOURS = 10;
const RESCORE_VIEW_GROWTH_MULTIPLIER = 2; // "views at least doubled" per the spec

const HOUR_MS = 60 * 60 * 1000;
const TOP_PER_LANGUAGE_GROUP = 3;

const SCORING_PIPELINE_TIMEOUT_MS = Number(process.env.VIDEO_SCORING_PIPELINE_TIMEOUT_MS ?? 100_000);

// Target size of the candidate pool per search. The primary query alone
// can return up to 20; per product feedback, the fallback ("{contest}
// solutions") is now ALSO run — and merged in, deduped — whenever the
// primary pool is short of this target, not only when the primary
// returned literally zero. Contest-level bundle/livestream videos often
// don't surface for a narrow "{contest} {code} {name}" query at all, so
// treating "primary found a few videos" as "done, skip the fallback" was
// silently leaving real candidates (including exactly the kind of
// higher-view bundle videos worth showing) off the table. Worst case is
// still the 2-call/200-unit budget the build spec already accounts for —
// this only changes WHEN that second call fires, not how many exist.
const TARGET_POOL_SIZE = 20;

export const VIDEO_SCORING_QUEUE = 'video-scoring';

export interface ScoreVideoJobData {
  videoDbId: string;
  youtubeVideoId: string;
}

function utcDateKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function cacheHitKey(): string {
  return `video-search-cache:hits:${utcDateKey()}`;
}
function cacheMissKey(): string {
  return `video-search-cache:misses:${utcDateKey()}`;
}

export function failedJobsTodayKey(): string {
  return `video-scoring:failed-jobs:${utcDateKey()}`;
}

const DAY_COUNTER_TTL_SECONDS = 26 * 60 * 60; // matches youtube-quota.service.ts's own 26h-not-24h reasoning

@Injectable()
export class VideosService implements OnModuleDestroy {
  private readonly logger = new Logger(VideosService.name);
  private readonly queueEvents: QueueEvents;

  constructor(
    private readonly prisma: PrismaService,
    private readonly youtube: YoutubeClient,
    private readonly languageDetection: LanguageDetectionService,
    private readonly redis: RedisService,
    private readonly gemini: GeminiClient,
    @InjectQueue(VIDEO_SCORING_QUEUE) private readonly scoringQueue: Queue<ScoreVideoJobData>,
  ) {
    // One shared QueueEvents listener for awaiting per-job completion —
    // BullMQ recommends a single long-lived instance rather than one per
    // wait() call.
    this.queueEvents = new QueueEvents(VIDEO_SCORING_QUEUE, {
      connection: RedisService.connectionOptions(),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents.close();
  }

  /**
   * Normalizes a search into a stable cache key. There is only ONE key per
   * problem now (the merged primary+fallback pool lives under it) — the
   * earlier separate fallback-only key was removed since the fallback is
   * no longer a distinct cached path, just an additional source merged
   * into the same pool before it's stored.
   */
  private buildQueryKey(platform: string, contestName: string, problemCode: string, problemName: string): string {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${norm(platform)}::${norm(contestName)}::${norm(problemCode)}::${norm(problemName)}`;
  }

  async search(
    problemName: string,
    platform: string,
    contestName: string,
    problemCode: string,
  ): Promise<VideoSearchResponse> {
    const queryKey = this.buildQueryKey(platform, contestName, problemCode, problemName);

    const cached = await this.prisma.videoSearchCache.findFirst({
      where: { queryKey, expiresAt: { gt: new Date() } },
    });

    let youtubeVideoIds: string[];
    let usedFallbackQuery: boolean;
    let resultCompleteness: 'full' | 'partial' | 'none';

    this.recordCacheOutcome(cached !== null).catch((err) => {
      this.logger.warn(`Failed to record cache hit/miss stat: ${(err as Error).message}`);
    });

    if (cached) {
      youtubeVideoIds = cached.videoIds;
      usedFallbackQuery = cached.usedFallbackQuery;
      resultCompleteness = cached.resultCompleteness;
    } else {
      const relevance = { contestName, problemCode, problemName, platform };

      // Primary query is EXACTLY "{contest_name} {problem_code} {problem_name}"
      // example ("Codeforces Round 1002 A Two
      // Arrays").
      const primaryIds = await this.runSearchQuery(`${contestName} ${problemCode} ${problemName}`, relevance);

      const mergedIds = [...primaryIds];
      let usedFallback = false;

      // Broaden whenever the primary pool is short of the target size —
      // not only when it's literally empty. The fallback query still
      // checks contest-level relevance (via `relevance`, letter-range
      // aware — see query-relevance.util.ts) rather than accepting
      // anything with the contest name in it, so a bundle video that
      // explicitly covers OTHER problems and clearly excludes this one is
      // still correctly dropped.
      if (mergedIds.length < TARGET_POOL_SIZE) {
        const fallbackIds = await this.runSearchQuery(`${contestName} solutions`, relevance);
        const seen = new Set(mergedIds);
        for (const id of fallbackIds) {
          if (!seen.has(id)) {
            mergedIds.push(id);
            seen.add(id);
          }
        }
        usedFallback = fallbackIds.length > 0;
      }

      youtubeVideoIds = mergedIds.slice(0, TARGET_POOL_SIZE);
      usedFallbackQuery = usedFallback;
      resultCompleteness =
        youtubeVideoIds.length === 0 ? 'none' : youtubeVideoIds.length < TARGET_POOL_SIZE ? 'partial' : 'full';

      await this.prisma.videoSearchCache.upsert({
        where: { queryKey },
        create: {
          queryKey,
          videoIds: youtubeVideoIds,
          usedFallbackQuery,
          resultCompleteness,
          expiresAt: this.cacheExpiry(),
        },
        update: { videoIds: youtubeVideoIds, usedFallbackQuery, resultCompleteness, expiresAt: this.cacheExpiry() },
      });
    }

    if (youtubeVideoIds.length === 0) {
      // Explicit "no videos found" — not an error,
      // not a silently empty success.
      return {
        problemName,
        platform,
        contestName,
        usedFallbackQuery,
        resultCompleteness: 'none',
        groups: [],
        degraded: {
          reason: 'no_results',
          message: 'No videos found for this problem, even after the broader contest-level fallback search.',
        },
      };
    }

    // Rank-then-score (see metadata-ranking.util.ts): decide which
    // candidates are even worth a Gemini call BEFORE calling Gemini, not
    // after scoring the whole ~20-video pool and truncating to top 3 per
    // language afterward. The results screen only ever shows the top
    // TOP_PER_LANGUAGE_GROUP videos per language group anyway, so scoring
    // (and therefore spending Gemini quota on) anything outside that
    // selection was pure waste — this was the actual cause of the
    // free-tier quota exhausting after only a few searches.
    const allCandidates = await this.prisma.video.findMany({ where: { youtubeVideoId: { in: youtubeVideoIds } } });
    const byLanguage = new Map<string | null, (typeof allCandidates)[number][]>();
    for (const v of allCandidates) {
      const key = v.language ?? null;
      const list = byLanguage.get(key) ?? [];
      list.push(v);
      byLanguage.set(key, list);
    }
    const selectedForScoring: (typeof allCandidates)[number][] = [];
    for (const group of byLanguage.values()) {
      selectedForScoring.push(...selectTopCandidatesByMetadata(group, TOP_PER_LANGUAGE_GROUP));
    }

    const scoredVideos = await this.ensureVideosScored(selectedForScoring.map((v) => v.youtubeVideoId));

    // Per the "no placeholders" fix: the pipeline waits for every relevant
    // video to finish scoring (see scoreInParallel below), so under normal
    // operation every video here already has `scoredAsOf` set. This filter
    // exists purely for the rare edge case where a video genuinely never
    // finished within SCORING_PIPELINE_TIMEOUT_MS (a hung Gemini call, a
    // dead worker, etc.) — such a straggler is dropped from the result
    // entirely rather than shown with a "Not scored yet" tag, because the
    // whole point of this flow is that everything the user sees is fully
    // computed.
    const completedVideos = scoredVideos.filter((v) => v.scoredAsOf !== null);

    if (completedVideos.length === 0) {
      this.logger.error(
        `Scoring pipeline finished with zero completed videos out of ${youtubeVideoIds.length} candidates — ` +
          'likely a queue/worker problem, not a content problem. Investigate the scoring queue before assuming there are really no videos.',
      );
      return {
        problemName,
        platform,
        contestName,
        usedFallbackQuery,
        resultCompleteness,
        groups: [],
        degraded: {
          reason: 'scoring_incomplete',
          message:
            'We found candidate videos but could not finish scoring them in time. Please try searching again in a moment.',
        },
      };
    }

    const groups = this.groupByLanguage(completedVideos);

    // Distinct from the `degraded` cases above: the search itself
    // succeeded and returned real, ranked results (metadata-only ranking
    // never depends on Gemini), but if the Gemini free-tier daily quota
    // is exhausted, some/all of these videos are popularity-only scored
    // rather than sentiment-scored. Checked once per search (not per
    // video) — isQuotaExhausted() is a single cheap Redis read — and only
    // surfaced when at least one video in THIS result actually fell back,
    // so a fully sentiment-scored result never carries a stale warning.
    let sentimentScoringNote: string | undefined;
    const anyPopularityOnly = completedVideos.some((v) => v.satisfactionScore === null);
    if (anyPopularityOnly && (await this.gemini.isQuotaExhausted())) {
      sentimentScoringNote =
        "Today's comment-sentiment quota (Gemini free tier) is exhausted, so some videos below are ranked by views/likes only, not comment sentiment. This resets daily.";
    }

    return {
      problemName,
      platform,
      contestName,
      usedFallbackQuery,
      resultCompleteness,
      groups,
      ...(sentimentScoringNote ? { sentimentScoringNote } : {}),
    };
  }

  private async recordCacheOutcome(hit: boolean): Promise<void> {
    const key = hit ? cacheHitKey() : cacheMissKey();
    const total = await this.redis.client.incr(key);
    if (total === 1) {
      // First write of the day for this key — set expiry once, same
      // one-time-expire-on-first-write pattern as YoutubeQuotaService.
      await this.redis.client.expire(key, DAY_COUNTER_TTL_SECONDS);
    }
  }

  async getPipelineMetrics(): Promise<{
    cache: { hits: number; misses: number; hitRate: number | null };
    queue: { size: number; pendingJobs: number; activeJobs: number; failedJobs: number };
  }> {
    const [hitsRaw, missesRaw, failedRaw, counts] = await Promise.all([
      this.redis.client.get(cacheHitKey()),
      this.redis.client.get(cacheMissKey()),
      this.redis.client.get(failedJobsTodayKey()),
      this.scoringQueue.getJobCounts('waiting', 'active', 'delayed'),
    ]);

    const hits = hitsRaw ? Number(hitsRaw) : 0;
    const misses = missesRaw ? Number(missesRaw) : 0;
    const total = hits + misses;
    // Null (not 0) when nothing has been recorded yet today — an honestly
    // empty stat, not a claim that every search missed.
    const hitRate = total === 0 ? null : Math.round((hits / total) * 10000) / 100;

    const pendingJobs = counts.waiting ?? 0;
    const activeJobs = counts.active ?? 0;
    const delayedJobs = counts.delayed ?? 0;

    return {
      cache: { hits, misses, hitRate },
      queue: {
        size: pendingJobs + activeJobs + delayedJobs,
        pendingJobs,
        activeJobs,
        failedJobs: failedRaw ? Number(failedRaw) : 0,
      },
    };
  }

  private cacheExpiry(): Date {
    // The search-result POOL (which video IDs matched this query) is a
    // separate concern from per-video SCORE freshness — pool membership
    // doesn't change quickly, so a longer TTL here is fine; individual
    // video scores still refresh on their own <5h/5-10h/>10h lifecycle
    // regardless of when the pool itself was last searched.
    return new Date(Date.now() + 24 * HOUR_MS);
  }

  private async runSearchQuery(
    query: string,
    relevance: { contestName: string; problemCode?: string; problemName?: string; platform?: string },
  ): Promise<string[]> {
    const searchResult = await this.youtube.search(query, 20);
    const ids = searchResult.items.map((i) => i.id.videoId);

    if (ids.length === 0) return [];

    const details = await this.youtube.getVideoDetails(ids);
    const relevantIds: string[] = [];

    for (const item of details.items) {
      // Metadata is upserted for EVERY candidate regardless of relevance —
      // videos are a global, shared cache , so there's no harm
      // in having correct metadata for a video even if it turns out not
      // to be relevant to THIS particular search.
      await this.upsertVideoMetadata(item);

      if (matchesSearchQuery(item.snippet.title, relevance)) {
        relevantIds.push(item.id);
      } else {
        this.logger.debug(
          `Dropping candidate "${item.snippet.title}" (${item.id}) — title doesn't mention the searched contest/problem (or explicitly claims a different one), likely irrelevant to this search`,
        );
      }
    }

    return relevantIds;
  }

  private async upsertVideoMetadata(item: {
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      publishedAt: string;
      defaultAudioLanguage?: string;
      description?: string;
    };
    statistics: { viewCount?: string; commentCount?: string; likeCount?: string };
    contentDetails?: { duration?: string };
  }): Promise<void> {
    const viewCount = Number(item.statistics.viewCount ?? 0);
    const commentCount = Number(item.statistics.commentCount ?? 0);
    const likeCount = Number(item.statistics.likeCount ?? 0);
    const durationMinutes = parseIso8601DurationToMinutes(item.contentDetails?.duration);
    const videoScope: VideoScope = inferVideoScope({ title: item.snippet.title, durationMinutes });

    const existing = await this.prisma.video.findUnique({ where: { youtubeVideoId: item.id } });

    if (!existing) {
      // Language is determined ONCE, at creation, and never re-run
      // automatically afterward — it's cached permanently, per the spec
      // ("it never changes"). A user-raised flag is the only thing that
      // can trigger a second attempt (see flagLanguage()).
      //
      // Three-step cascade, cheapest/most-reliable first — the transcript
      // fetch (step 3) is the ONLY one that hits the fragile unofficial
      // endpoint, so resolving as many videos as possible in steps 1-2
      // directly reduces how often that endpoint gets hit at all, which
      // is the main fix for the reported transcript 429 storm.
      const detected =
        this.languageDetection.fromMetadata(item.snippet.defaultAudioLanguage) ??
        this.languageDetection.fromMetadataText(item.snippet.title, item.snippet.description) ??
        (await this.languageDetection.fromTranscript(item.id));

      await this.prisma.video.create({
        data: {
          youtubeVideoId: item.id,
          title: item.snippet.title,
          channelName: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : null,
          viewCount,
          commentCount,
          likeCount,
          durationMinutes: durationMinutes ?? null,
          videoScope,
          language: detected.language,
          languageConfidence: detected.confidence,
          languageSource: detected.source,
        },
      });
    } else {
      // Metadata (views/likes/comments/duration) refreshes on every
      // re-fetch; language stays as previously determined. Scope IS
      // re-inferred here (unlike language) since duration is a stable
      // fact that might not have been available on first insert
      // (defensive; in practice contentDetails.duration is always present
      // once a video finishes processing), and re-running the cheap pure
      // function costs nothing.
      await this.prisma.video.update({
        where: { id: existing.id },
        data: {
          viewCount,
          commentCount,
          likeCount,
          durationMinutes: durationMinutes ?? existing.durationMinutes,
          videoScope,
        },
      });
    }
  }

  /**
   * Applies the Section 3 cache lifecycle to every candidate: <5h old
   * skips straight through; 5-10h old gets a cheap view-count check before
   * deciding whether a full rescore is worth it; >10h old (or never
   * scored) is queued unconditionally. Scoring jobs run in parallel via
   * BullMQ (bounded to a small worker concurrency — see VideosProcessor —
   * so Gemini/YouTube don't see an unbounded burst), and this method now
   * waits for the WHOLE batch to finish before returning, per the
   * "quality over speed" fix: the caller gets either a fully scored result
   * or an honest degraded state, never a list with "Not scored yet" mixed
   * in.
   */
  private async ensureVideosScored(youtubeVideoIds: string[]) {
    const videos = await this.prisma.video.findMany({ where: { youtubeVideoId: { in: youtubeVideoIds } } });

    const toScore: (typeof videos)[number][] = [];
    for (const video of videos) {
      if (video.scoredAsOf === null) {
        toScore.push(video);
        continue;
      }
      const ageMs = Date.now() - video.scoredAsOf.getTime();
      if (ageMs < FRESH_HOURS * HOUR_MS) {
        continue; // served as-is
      }
      if (ageMs < STALE_HOURS * HOUR_MS) {
        // Gated: only proceed if a cheap metadata check shows real growth.
        const grew = await this.viewsGrewSignificantly(video.youtubeVideoId, video.viewCount);
        if (grew) toScore.push(video);
        continue;
      }
      // >10h — lazily rescore on read, no scheduled job required.
      toScore.push(video);
    }

    if (toScore.length > 0) {
      await this.scoreInParallel(toScore.map((v) => ({ videoDbId: v.id, youtubeVideoId: v.youtubeVideoId })));
    }

    return this.prisma.video.findMany({ where: { youtubeVideoId: { in: youtubeVideoIds } } });
  }

  private async viewsGrewSignificantly(youtubeVideoId: string, storedViewCount: number): Promise<boolean> {
    try {
      const details = await this.youtube.getVideoDetails([youtubeVideoId]);
      const current = Number(details.items[0]?.statistics.viewCount ?? storedViewCount);
      if (current > storedViewCount) {
        await this.prisma.video.updateMany({ where: { youtubeVideoId }, data: { viewCount: current } });
      }
      return current >= storedViewCount * RESCORE_VIEW_GROWTH_MULTIPLIER;
    } catch (err) {
      // If even the cheap check fails, don't force an expensive rescore —
      // degrade to "cached score still stands."
      this.logger.warn(`View-growth check failed for ${youtubeVideoId}: ${(err as Error).message}`);
      return false;
    }
  }

  private async scoreInParallel(jobs: ScoreVideoJobData[]): Promise<void> {
    const added = await Promise.all(
      jobs.map((data) => this.scoringQueue.add('score', data, { removeOnComplete: true, removeOnFail: true })),
    );

    // Wait for the ENTIRE batch to finish before returning — this is the
    // "great fix" behavior change: the caller (search()) does not proceed
    // to build a result until every job here has either completed or
    // definitively timed out against the generous SCORING_PIPELINE_TIMEOUT_MS
    // cap. There is no more "return whatever's done after 20s" — actual
    // per-video concurrency is bounded separately, at the BullMQ worker
    // level (see the `concurrency` option on VideosProcessor's @Processor
    // decorator), not by racing this wait against a short clock.
    //
    // A job that STILL doesn't finish within the cap (should be rare — the
    // cap is sized generously for the pool size / worker concurrency we
    // actually use) logs loudly here and is left with `scoredAsOf` unset;
    // `search()` filters those out of the final result rather than
    // presenting a half-finished video as if it were ranked.
    const settled = await Promise.allSettled(
      added.map((job) => job.waitUntilFinished(this.queueEvents, SCORING_PIPELINE_TIMEOUT_MS)),
    );

    settled.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Scoring job for ${added[i].data.youtubeVideoId} did not finish within ${SCORING_PIPELINE_TIMEOUT_MS}ms: ${result.reason?.message ?? result.reason}`,
        );
      }
    });
  }

  /**
   * Groups by language, then — WITHIN each language — ranks by finalScore
   * descending. finalScore is now always a number once a scoring pass has
   * completed (see score-aggregation.util.ts: a no-comment video gets a
   * penalized popularity-only score, not null), so this naturally sorts
   * "has trustworthy sentiment" above "popularity-only fallback" above
   * "still-pending" (genuinely null, never scored yet) — one ordered list
   * per language rather than a separate "unscored" bucket.
   */
  private groupByLanguage(videos: Array<any>): VideoLanguageGroup[] {
    const byLang = new Map<string | null, VideoSummary[]>();

    for (const v of videos) {
      const summary = this.toSummary(v);
      const key = v.language ?? null;
      const list = byLang.get(key) ?? [];
      list.push(summary);
      byLang.set(key, list);
    }

    const groups: VideoLanguageGroup[] = [];
    for (const [language, list] of byLang) {
      const sorted = [...list].sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
      groups.push({ language, videos: sorted.slice(0, TOP_PER_LANGUAGE_GROUP) });
    }

    // Deterministic ordering: named languages first (alphabetical), the
    // "uncertain" (null) group last — so the UI doesn't lead with videos
    // nobody can confirm the language of.
    return groups.sort((a, b) => {
      if (a.language === null) return 1;
      if (b.language === null) return -1;
      return a.language.localeCompare(b.language);
    });
  }

  private toSummary(v: any): VideoSummary {
    return {
      id: v.id,
      youtubeVideoId: v.youtubeVideoId,
      title: v.title,
      channelName: v.channelName,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      viewCount: v.viewCount,
      commentCount: v.commentCount,
      likeCount: v.likeCount,
      durationMinutes: v.durationMinutes,
      satisfactionScore: v.satisfactionScore,
      finalScore: v.finalScore,
      sentimentApplied: v.satisfactionScore !== null,
      language: v.language,
      languageConfidence: v.languageConfidence,
      languageSource: v.languageSource,
      videoScope: v.videoScope,
      scoredAsOf: v.scoredAsOf ? v.scoredAsOf.toISOString() : null,
      userFlaggedIncorrect: v.userFlaggedIncorrect,
    };
  }

  async getById(id: string) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    return this.toSummary(video);
  }

  async getScoreBreakdown(id: string): Promise<VideoScoreBreakdown> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');

    const viewWeight = video.viewCount > 0 ? Math.min(100, (Math.log10(video.viewCount + 1) / 6) * 100) : 0;

    return {
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      satisfactionScore: video.satisfactionScore,
      viewWeightScore: viewWeight,
      finalScore: video.finalScore,
      sampledCommentCount: video.sampledCommentCount,
      scoredAsOf: video.scoredAsOf ? video.scoredAsOf.toISOString() : null,
      videoScope: video.videoScope,
      durationMinutes: video.durationMinutes,
      scopeNote: scopeNoteFor(video.videoScope, video.durationMinutes ?? undefined),
      methodologyNote:
        video.satisfactionScore !== null
          ? "This score is a proxy, not a precise measurement: YouTube's top-50-by-relevance comments skew toward already-popular, more strongly-opinionated comments and underrepresent the quiet middle."
          : 'This video had no comments, too few comments to trust, or its sentiment call failed — the score shown is popularity-only (views/likes), scaled down relative to videos with a trusted sentiment signal.',
    };
  }

  /**
   * Per Section 3: "if a user flags a video as wrong-language, re-run
   * detection only if a transcript wasn't already tried, otherwise mark
   * it user_flagged_incorrect for manual review — there is no independent
   * audio-based cross-check anymore, so a flag with no alternate source
   * to check just needs to be visible, not silently 'fixed.'"
   */
  async flagLanguage(id: string, correctedLanguage?: string): Promise<VideoSummary> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');

    if (video.languageSource === 'metadata') {
      // Metadata-sourced language never had a transcript attempt — try
      // the transcript now as the one alternate source available.
      const retried = await this.languageDetection.fromTranscript(video.youtubeVideoId);
      if (retried.source === 'transcript' && retried.language) {
        const updated = await this.prisma.video.update({
          where: { id },
          data: {
            language: retried.language,
            languageConfidence: retried.confidence,
            languageSource: 'transcript',
            userFlaggedIncorrect: false,
          },
        });
        return this.toSummary(updated);
      }
    }

    // Either the source was already 'transcript' (nothing left to
    // re-check) or the retry above also failed — visible for manual
    // review, not silently "fixed."
    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        userFlaggedIncorrect: true,
        language: correctedLanguage ?? video.language,
      },
    });
    return this.toSummary(updated);
  }
}
