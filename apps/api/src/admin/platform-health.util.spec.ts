import { buildPlatformHealth } from './platform-health.util';
import type { CodeforcesHealth, DependencyHealth, TranscriptCanaryStatus } from '@uphelper/shared-types';

function healthyInputs() {
  const codeforces: CodeforcesHealth = {
    reachable: true,
    lastSuccessfulSyncAt: '2026-07-06T10:00:00.000Z',
    lastError: null,
    checkedAt: '2026-07-06T12:00:00.000Z',
  };
  const transcriptCanary: TranscriptCanaryStatus = {
    health: 'healthy',
    detail: 'Transcript fetch OK, detected language: en',
    lastCheckedAt: '2026-07-06T11:00:00.000Z',
  };
  const redis: DependencyHealth = { status: 'healthy', checkedAt: '2026-07-06T12:00:00.000Z' };
  const database: DependencyHealth = { status: 'healthy', checkedAt: '2026-07-06T12:00:00.000Z' };
  return { codeforces, transcriptCanary, redis, database };
}

describe('buildPlatformHealth', () => {
  it('is not degraded when every dependency is healthy', () => {
    const result = buildPlatformHealth(healthyInputs());
    expect(result.degraded).toBe(false);
  });

  it('is degraded when Codeforces is unreachable', () => {
    const inputs = healthyInputs();
    inputs.codeforces.reachable = false;
    expect(buildPlatformHealth(inputs).degraded).toBe(true);
  });

  it('is degraded when the transcript canary is unhealthy', () => {
    const inputs = healthyInputs();
    inputs.transcriptCanary.health = 'unhealthy';
    expect(buildPlatformHealth(inputs).degraded).toBe(true);
  });

  it('is NOT degraded when the transcript canary is merely rate_limited', () => {
    // A 429 means the endpoint responded and is enforcing a limit — that's
    // evidence it's up, not evidence it's broken. See the canary job's own
    // reasoning for why this case is excluded from the failure streak too.
    const inputs = healthyInputs();
    inputs.transcriptCanary.health = 'rate_limited';
    expect(buildPlatformHealth(inputs).degraded).toBe(false);
  });

  it('is degraded when Redis is down', () => {
    const inputs = healthyInputs();
    inputs.redis.status = 'down';
    expect(buildPlatformHealth(inputs).degraded).toBe(true);
  });

  it('is degraded when the database is down', () => {
    const inputs = healthyInputs();
    inputs.database.status = 'down';
    expect(buildPlatformHealth(inputs).degraded).toBe(true);
  });

  it('passes every field through unchanged', () => {
    const inputs = healthyInputs();
    const result = buildPlatformHealth(inputs);
    expect(result.codeforces).toBe(inputs.codeforces);
    expect(result.transcriptCanary).toBe(inputs.transcriptCanary);
    expect(result.redis).toBe(inputs.redis);
    expect(result.database).toBe(inputs.database);
  });
});
