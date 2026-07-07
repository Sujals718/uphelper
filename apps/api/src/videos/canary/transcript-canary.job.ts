import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LanguageDetectionService } from '../language-detection.service';
import { RedisService } from '../../redis/redis.service';

// A stable, long-lived, widely-captioned public video used purely as a
// canary target — not app content, not tied to any user. Picked for
// having auto-captions that are extremely unlikely to disappear.
// Swap this for any known-captioned video if this one ever gets pulled.
const CANARY_VIDEO_ID = 'jNQXAC9IVRw'; // "Me at the zoo" — first YouTube video ever uploaded, has auto-captions

const CANARY_STATUS_KEY = 'canary:transcript-fetch:status';
const CANARY_CONSECUTIVE_FAILURES_KEY = 'canary:transcript-fetch:consecutive-failures';

// A single non-rate-limited failure could just be a network blip. Only
// call the endpoint genuinely "broken" after several hourly checks in a
// row have failed for a reason OTHER than rate-limiting — this is what
// lets a burst of 429s (which, under real traffic, can absolutely line up
// with the canary's own hourly tick) pass through as "still healthy,
// just busy" instead of paging someone for a problem that isn't real.
const UNHEALTHY_AFTER_CONSECUTIVE_FAILURES = 3;

export type CanaryHealth = 'healthy' | 'rate_limited' | 'unhealthy';

export interface CanaryStatus {
  lastCheckedAt: string;
  healthy: boolean; // kept for backward-compat with any existing admin-panel reads; true for both 'healthy' and 'rate_limited'
  health: CanaryHealth;
  detail: string;
}


@Injectable()
export class TranscriptCanaryJob {
  private readonly logger = new Logger(TranscriptCanaryJob.name);

  constructor(
    private readonly languageDetection: LanguageDetectionService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runCanaryCheck(): Promise<void> {
    const result = await this.languageDetection.fromTranscript(CANARY_VIDEO_ID);
    const succeeded = result.source === 'transcript' && result.language !== null;

    let health: CanaryHealth;
    let detail: string;

    if (succeeded) {
      await this.redis.client.del(CANARY_CONSECUTIVE_FAILURES_KEY);
      health = 'healthy';
      detail = `Transcript fetch OK, detected language: ${result.language}`;
    } else if (result.rateLimited) {
      // Explicitly NOT counted toward the consecutive-failure streak — a
      // 429 says "the endpoint responded and is enforcing a rate limit,"
      // which is evidence it's working, not evidence it's broken.
      health = 'rate_limited';
      detail = 'Transcript fetch was rate-limited (HTTP 429) on this check — endpoint is up, just busy. Not treated as a failure.';
      this.logger.debug(`Transcript-fetch canary: ${detail}`);
    } else {
      const consecutiveFailures = await this.redis.client.incr(CANARY_CONSECUTIVE_FAILURES_KEY);
      if (consecutiveFailures >= UNHEALTHY_AFTER_CONSECUTIVE_FAILURES) {
        health = 'unhealthy';
        detail = `Transcript fetch/parse has failed ${consecutiveFailures} checks in a row (non-rate-limit reasons) — the unofficial timedtext endpoint may have changed`;
        this.logger.error(`Transcript-fetch canary FAILED: ${detail}`);
      } else {
        // Below the streak threshold — log it, but don't declare the
        // dependency unhealthy over what might still be a one-off blip.
        health = 'healthy';
        detail = `Transcript fetch failed this check (${consecutiveFailures}/${UNHEALTHY_AFTER_CONSECUTIVE_FAILURES} consecutive) — watching, not yet flagged unhealthy`;
        this.logger.warn(`Transcript-fetch canary: ${detail}`);
      }
    }

    const status: CanaryStatus = {
      lastCheckedAt: new Date().toISOString(),
      healthy: health !== 'unhealthy',
      health,
      detail,
    };

    await this.redis.client.set(CANARY_STATUS_KEY, JSON.stringify(status));
  }

  async getLastStatus(): Promise<CanaryStatus | null> {
    const raw = await this.redis.client.get(CANARY_STATUS_KEY);
    return raw ? (JSON.parse(raw) as CanaryStatus) : null;
  }
}
