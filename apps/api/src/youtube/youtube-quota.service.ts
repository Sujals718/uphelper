import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const DAILY_QUOTA_LIMIT = Number(process.env.YOUTUBE_DAILY_QUOTA ?? 10_000);
// "Throttle non-essential calls (re-scoring already-cached videos) at 80%
const THROTTLE_THRESHOLD = DAILY_QUOTA_LIMIT * 0.8;

function todayKey(): string {
  // YouTube's quota resets at midnight Pacific time, not UTC — but for a
  // resume-scale project running one region, a UTC-day key is a
  // documented simplification, not a precision guarantee. Worth
  // revisiting only if quota timing edge cases actually bite in practice.
  const d = new Date();
  return `yt-quota:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/**
 * Self-tracked quota counter — YouTube doesn't expose remaining-quota
 * headers on responses, so this app has to keep its own running total in
 * Redis (INCRBY, with a 26h TTL so a stuck key can't outlive more than
 * one extra day if the reset-time math above is ever slightly off).
 */
@Injectable()
export class YoutubeQuotaService {
  private readonly logger = new Logger(YoutubeQuotaService.name);

  constructor(private readonly redis: RedisService) {}

  async recordUsage(units: number): Promise<void> {
    const key = todayKey();
    const total = await this.redis.client.incrby(key, units);
    if (total === units) {
      // First write of the day for this key — set expiry once.
      await this.redis.client.expire(key, 26 * 60 * 60);
    }
  }

  async getUsageToday(): Promise<number> {
    const raw = await this.redis.client.get(todayKey());
    return raw ? Number(raw) : 0;
  }
  
  getDailyLimit(): number {
    return DAILY_QUOTA_LIMIT;
  }

  /**
   * True once today's usage has crossed the 80% throttle line. Callers use
   * this to skip NON-ESSENTIAL calls only (re-scoring an already-cached
   * video) — a brand-new user search still gets its one primary query
   * even past this threshold, since returning "no videos found" for every
   * search once quota is tight would be a worse failure mode than a
   * slightly-stale rescore being skipped.
   */
  async isThrottled(): Promise<boolean> {
    const used = await this.getUsageToday();
    if (used >= THROTTLE_THRESHOLD) {
      this.logger.warn(`YouTube quota at ${used}/${DAILY_QUOTA_LIMIT} — throttling non-essential calls`);
      return true;
    }
    return false;
  }

  async isExhausted(): Promise<boolean> {
    return (await this.getUsageToday()) >= DAILY_QUOTA_LIMIT;
  }
}
