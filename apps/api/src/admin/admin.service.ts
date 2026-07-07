import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PromptTemplate, PromptType, User } from '@prisma/client';
import type {
  AdminPromptTemplatesResponse,
  AdminPromptTemplateVersion,
  AdminUserListItem,
  AdminUsersResponse,
  DependencyHealth,
  PlatformHealthResponse,
  TranscriptCanaryStatus,
  VideoPipelineMetrics,
} from '@uphelper/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PlatformsService } from '../platforms/platforms.service';
import { VideosService } from '../videos/videos.service';
import { TranscriptCanaryJob } from '../videos/canary/transcript-canary.job';
import { YoutubeQuotaService } from '../youtube/youtube-quota.service';
import { buildPlatformHealth } from './platform-health.util';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly platforms: PlatformsService,
    private readonly transcriptCanary: TranscriptCanaryJob,
    private readonly videos: VideosService,
    private readonly youtubeQuota: YoutubeQuotaService,
  ) {}

  private toListItem(user: User): AdminUserListItem {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isDisabled: user.isDisabled,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * GET /admin/users — search by name/email (case-insensitive, matches
   * either field), paginated. No `search` at all just returns page 1 of
   * everyone, newest first.
   */
  async listUsers(search?: string, page?: number, pageSize?: number): Promise<AdminUsersResponse> {
    const currentPage = page && page > 0 ? page : DEFAULT_PAGE;
    const currentPageSize = pageSize && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;

    const trimmed = search?.trim();
    const where: Prisma.UserWhereInput = trimmed
      ? {
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * currentPageSize,
        take: currentPageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map((u) => this.toListItem(u)),
      total,
      page: currentPage,
      pageSize: currentPageSize,
    };
  }

  /**
   * PATCH /admin/users/:id — toggle isDisabled only. No delete, no
   * profile edit, per scope. Blocks an admin from disabling their own
   * account, since that would lock them out with no other admin
   * necessarily around to undo it — a small, cheap safety check worth
   * having even in a "lightweight ops dashboard."
   */
  async setUserDisabled(
    currentUserId: string,
    targetUserId: string,
    isDisabled: boolean,
  ): Promise<AdminUserListItem> {
    if (isDisabled && targetUserId === currentUserId) {
      throw new BadRequestException('You cannot disable your own account');
    }

    const existing = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isDisabled },
    });

    return this.toListItem(updated);
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const pong = await this.redis.client.ping();
      return pong === 'PONG'
        ? { status: 'healthy', checkedAt }
        : { status: 'degraded', detail: `Unexpected PING reply: ${pong}`, checkedAt };
    } catch (err) {
      return {
        status: 'down',
        detail: err instanceof Error ? err.message : 'Redis ping failed',
        checkedAt,
      };
    }
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    const checkedAt = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', checkedAt };
    } catch (err) {
      return {
        status: 'down',
        detail: err instanceof Error ? err.message : 'Database query failed',
        checkedAt,
      };
    }
  }

  private toTranscriptCanaryStatus(
    raw: Awaited<ReturnType<TranscriptCanaryJob['getLastStatus']>>,
  ): TranscriptCanaryStatus {
    if (!raw) {
      // The canary runs hourly (see transcript-canary.job.ts) — a null
      // read just means it hasn't completed its first tick yet (e.g.
      // right after a fresh deploy), not that anything is broken.
      return {
        health: 'unknown',
        detail: 'Transcript-fetch canary has not reported a result yet',
        lastCheckedAt: null,
      };
    }
    return {
      health: raw.health,
      detail: raw.detail,
      lastCheckedAt: raw.lastCheckedAt,
    };
  }

  /**
   * GET /admin/platform-health — aggregates the four independent
   * dependency checks (Codeforces, transcript canary, Redis, database)
   * in parallel, then hands them to the pure `buildPlatformHealth` to
   * decide the overall `degraded` flag. Nothing here decides what
   * "degraded" means — that logic lives entirely in the pure util so
   * it's unit-testable on its own, same split as `weakness-heatmap.util`.
   */
  async platformHealth(): Promise<PlatformHealthResponse> {
    const [codeforces, canaryRaw, redis, database] = await Promise.all([
      this.platforms.health(),
      this.transcriptCanary.getLastStatus(),
      this.checkRedis(),
      this.checkDatabase(),
    ]);

    return buildPlatformHealth({
      codeforces,
      transcriptCanary: this.toTranscriptCanaryStatus(canaryRaw),
      redis,
      database,
    });
  }

  /**
   * GET /admin/video-pipeline-metrics . Quota comes
   * straight from YoutubeQuotaService (it's the source of truth
   * YoutubeClient itself writes to on every call); cache hit-rate and
   * BullMQ queue counts come from VideosService.getPipelineMetrics() —
   * see that method's own comment for why `failedJobs` is a separate
   * Redis counter rather than BullMQ's own (auto-purged) failed set.
   */
  async videoPipelineMetrics(): Promise<VideoPipelineMetrics> {
    const [quotaUsedToday, pipeline] = await Promise.all([
      this.youtubeQuota.getUsageToday(),
      this.videos.getPipelineMetrics(),
    ]);
    const quotaLimit = this.youtubeQuota.getDailyLimit();

    return {
      youtube: {
        quotaUsedToday,
        quotaLimit,
        quotaThrottled: await this.youtubeQuota.isThrottled(),
      },
      cache: pipeline.cache,
      queue: pipeline.queue,
      checkedAt: new Date().toISOString(),
    };
  }

  private toPromptTemplateItem(template: PromptTemplate): AdminPromptTemplateVersion {
    return {
      id: template.id,
      type: template.type,
      version: template.version,
      body: template.body,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
    };
  }

  /**
   * GET /admin/prompt-templates — full version history for both template
   * types ("view/edit the two prompt templates and see version
   * history without a redeploy"). Grouped by type here rather than left as
   * one flat list, since the admin UI needs two separate history panels
   * (Hint / Debug), not one interleaved feed.
   */
  async listPromptTemplates(): Promise<AdminPromptTemplatesResponse> {
    const templates = await this.prisma.promptTemplate.findMany({
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });

    const items = templates.map((t) => this.toPromptTemplateItem(t));

    return {
      hint: items.filter((t) => t.type === 'hint'),
      debug: items.filter((t) => t.type === 'debug'),
    };
  }

  /**
   * PATCH /admin/prompt-templates — "create new version instead of
   * overwriting" per the build instructions: this never mutates an
   * existing row's `body` in place. It reads the current highest version
   * for the given type, inserts a new row at version+1 with isActive:true,
   * and deactivates every previously-active row of that type — all inside
   * one transaction so a crash mid-way never leaves two rows active at
   * once (the exact case PromptsService.getActiveTemplate's own comment
   * says it tolerates but shouldn't normally happen).
   */
  async updateActivePromptTemplate(type: PromptType, body: string): Promise<AdminPromptTemplateVersion> {
    const latest = await this.prisma.promptTemplate.findFirst({
      where: { type },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.promptTemplate.updateMany({
        where: { type, isActive: true },
        data: { isActive: false },
      });
      return tx.promptTemplate.create({
        data: { type, version: nextVersion, body, isActive: true },
      });
    });

    return this.toPromptTemplateItem(created);
  }
}
