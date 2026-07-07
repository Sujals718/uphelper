import type {
  CodeforcesHealth,
  DependencyHealth,
  PlatformHealthResponse,
  TranscriptCanaryStatus,
} from '@uphelper/shared-types';

/**
 * Pure aggregation of the four independent health checks that make up
 * `GET /admin/platform-health` — no I/O here, same reasoning as
 * `buildContestSummaries` / `buildWeaknessHeatmap`: the actual Redis/
 * Prisma/HTTP calls live in AdminService, this just decides what
 * "degraded" means once those results are in hand, so that decision is
 * unit-testable against fixture inputs instead of only being exercisable
 * through mocked service tests.
 *
 * `degraded` intentionally does NOT trip on a `rate_limited` transcript
 * canary — see transcript-canary.job.ts: a 429 means the endpoint is up
 * and enforcing a limit, which is evidence of health, not the absence of
 * it. Only `unhealthy` counts against the aggregate flag.
 */
export function buildPlatformHealth(input: {
  codeforces: CodeforcesHealth;
  transcriptCanary: TranscriptCanaryStatus;
  redis: DependencyHealth;
  database: DependencyHealth;
}): PlatformHealthResponse {
  const { codeforces, transcriptCanary, redis, database } = input;

  const degraded =
    !codeforces.reachable ||
    transcriptCanary.health === 'unhealthy' ||
    redis.status !== 'healthy' ||
    database.status !== 'healthy';

  return { codeforces, transcriptCanary, redis, database, degraded };
}
