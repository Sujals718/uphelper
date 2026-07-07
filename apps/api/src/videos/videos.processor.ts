import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { YoutubeClient } from '../youtube/youtube-client.service';
import { GeminiClient } from '../gemini/gemini-client.service';
import { computeFinalScore } from './score-aggregation.util';
import { VIDEO_SCORING_QUEUE, ScoreVideoJobData, failedJobsTodayKey } from './videos.service';

const FAILED_COUNTER_TTL_SECONDS = 26 * 60 * 60; // same 26h-not-24h reasoning as youtube-quota.service.ts

// How many scoring jobs this worker processes AT THE SAME TIME. Each job
// makes one Gemini sentiment call, so this is directly "how many
// concurrent Gemini requests can this app generate" — per the fix
// request, bounded to a small number (2-3) rather than left unbounded, to
// avoid overloading Gemini or racking up simultaneous-timeout risk when a
// ~20-video candidate pool all gets queued for scoring at once.
const GEMINI_SCORING_CONCURRENCY = Number(process.env.GEMINI_SCORING_CONCURRENCY ?? 3);

/**
 * The actual per-video scoring work, run as a BullMQ job so ~20 candidate
 * videos per search score with BOUNDED concurrency (see
 * GEMINI_SCORING_CONCURRENCY above) instead of blocking the request on
 * that many sequential Gemini calls, and without firing them all at once
 * either. Deliberately simple — this can start out running in-process
 * (BullMQ workers run in the same Node process unless explicitly split
 * into a separate worker process) and only needs to move to a dedicated
 * worker process if scoring latency becomes a real problem at scale, per
 * the build async-jobs note.
 */
@Processor(VIDEO_SCORING_QUEUE, { concurrency: GEMINI_SCORING_CONCURRENCY })
export class VideosProcessor extends WorkerHost {
  private readonly logger = new Logger(VideosProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly youtube: YoutubeClient,
    private readonly gemini: GeminiClient,
  ) {
    super();
  }

  @OnWorkerEvent('failed')
  async onJobFailed(job: Job<ScoreVideoJobData> | undefined, error: Error): Promise<void> {
    this.logger.error(
      `Scoring job failed for ${job?.data?.youtubeVideoId ?? 'unknown video'}: ${error.message}`,
    );
    try {
      const key = failedJobsTodayKey();
      const total = await this.redis.client.incr(key);
      if (total === 1) {
        await this.redis.client.expire(key, FAILED_COUNTER_TTL_SECONDS);
      }
    } catch (err) {
      // Best-effort instrumentation only — never let a Redis blip while
      // recording this surface as if the scoring job itself failed again.
      this.logger.warn(`Failed to record failed-job stat: ${(err as Error).message}`);
    }
  }

  async process(job: Job<ScoreVideoJobData>): Promise<void> {
    const { videoDbId, youtubeVideoId } = job.data;

    const video = await this.prisma.video.findUnique({ where: { id: videoDbId } });
    if (!video) {
      this.logger.warn(`Scoring job for missing video row ${videoDbId} — skipping`);
      return;
    }

    // If today's Gemini quota is already known exhausted, don't bother
    // spending YouTube quota fetching comments either — scoreCommentSentiment
    // would just short-circuit to null anyway. Checked once per video job,
    // not per search, since jobs can be queued and processed well after
    // the search request that enqueued them returned.
    const quotaExhausted = await this.gemini.isQuotaExhausted();
    const comments = quotaExhausted ? [] : await this.youtube.getTopComments(youtubeVideoId, 50);
    const sentiment = quotaExhausted ? null : await this.gemini.scoreCommentSentiment(comments);

    // Use the ACTUAL number of comments we had available (comments.length)
    // as the trust-threshold input, not sentiment?.sampledCommentCount —
    // those are the same number when Gemini succeeds, but if Gemini fails
    // outright after we had comments, sentiment is null and its own
    // sampledCommentCount would be unavailable. computeFinalScore needs to
    // know "how many comments did we actually have" either way to decide
    // whether a sentiment score (if any) is trustworthy.
    const { finalScore, sentimentApplied } = computeFinalScore({
      satisfactionScore: sentiment?.satisfactionScore ?? null,
      sampledCommentCount: comments.length,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
    });

    await this.prisma.video.update({
      where: { id: videoDbId },
      data: {
        sentimentScore: sentiment?.satisfactionScore ?? null,
        // Only set satisfactionScore (the number shown as "Satisfaction %"
        // in the UI) when the sentiment component actually applied — a
        // popularity-only fallback score should not be mislabeled as a
        // sentiment reading.
        satisfactionScore: sentimentApplied ? sentiment!.satisfactionScore : null,
        sampledCommentCount: comments.length,
        finalScore,
        scoredAsOf: new Date(),
      },
    });
  }
}
