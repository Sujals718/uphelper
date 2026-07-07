
type AdminUserRole = 'user' | 'admin';

/** One row in the admin user list — deliberately narrow: no delete, no
 * profile editing, just enough to search and toggle account access. */
export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: AdminUserRole;
  isDisabled: boolean;
  createdAt: string;
}

export interface AdminUsersResponse {
  users: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export type DependencyHealthStatus = 'healthy' | 'degraded' | 'down';

export interface DependencyHealth {
  status: DependencyHealthStatus;
  detail?: string;
  checkedAt: string;
}

export interface CodeforcesHealth {
  reachable: boolean;
  /** Most recent lastSyncedAt across every linked platform_account, not
   * scoped to one user — this is a system-wide health screen. Null if no
   * account has ever synced successfully. */
  lastSuccessfulSyncAt: string | null;
  /** Most recent sync failure seen by ANY user's sync() call, kept until
   * the next failure overwrites it — this is "last known error," not
   * "currently erroring." Null if none has ever been recorded. */
  lastError: { message: string; occurredAt: string } | null;
  checkedAt: string;
}

export type TranscriptCanaryHealth = 'healthy' | 'rate_limited' | 'unhealthy' | 'unknown';

export interface TranscriptCanaryStatus {
  health: TranscriptCanaryHealth;
  detail: string;
  lastCheckedAt: string | null;
}

export interface PlatformHealthResponse {
  codeforces: CodeforcesHealth;
  transcriptCanary: TranscriptCanaryStatus;
  redis: DependencyHealth;
  database: DependencyHealth;
  /** True if any dependency above is unhealthy enough to need attention.
   * A rate_limited canary does NOT count as degraded (see
   * transcript-canary.job.ts — a 429 is "busy," not "broken"). */
  degraded: boolean;
}

export interface VideoPipelineMetrics {
  youtube: {
    quotaUsedToday: number;
    quotaLimit: number;
    /** True once usage has crossed the 80% throttle line (see
     * youtube-quota.service.ts) — non-essential calls (re-scoring an
     * already-cached video) are being skipped, not that search is down. */
    quotaThrottled: boolean;
  };
  cache: {
    /** Video-search-pool cache hits/misses recorded today (see
     * VideosService.search() — a "hit" is a non-expired VideoSearchCache
     * row for the query key, a "miss" is a fresh YouTube search). */
    hits: number;
    misses: number;
    /** Percentage 0-100, rounded to 2 decimals. Null (not 0) when no
     * searches have been recorded yet today — an honestly-empty stat, not
     * a claim that every search missed. */
    hitRate: number | null;
  };
  queue: {
    /** waiting + active + delayed jobs on the video-scoring BullMQ queue. */
    size: number;
    /** Jobs queued but not yet picked up by a worker. */
    pendingJobs: number;
    activeJobs: number;
    /** A separate Redis counter, NOT BullMQ's own failed-job count —
     * scoreInParallel() adds jobs with `removeOnFail: true`, so BullMQ's
     * own failed set is emptied almost immediately and would always read
     * ~0. This counts failures recorded today via a 'failed' worker-event
     * listener instead (see videos.processor.ts). */
    failedJobs: number;
  };
  checkedAt: string;
}

export type AdminPromptTemplateType = 'hint' | 'debug';

/** One row from the `prompt_templates` table, as surfaced to the admin
 * panel — includes every version, not just the active one, so the UI can
 * show version history. */
export interface AdminPromptTemplateVersion {
  id: string;
  type: AdminPromptTemplateType;
  version: number;
  body: string;
  isActive: boolean;
  createdAt: string;
}

/** GET /admin/prompt-templates — full version history for both template
 * types, each array sorted newest-version-first. */
export interface AdminPromptTemplatesResponse {
  hint: AdminPromptTemplateVersion[];
  debug: AdminPromptTemplateVersion[];
}
