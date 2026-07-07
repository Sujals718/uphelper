import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PlatformsService } from '../platforms/platforms.service';
import { TranscriptCanaryJob } from '../videos/canary/transcript-canary.job';
import { VideosService } from '../videos/videos.service';
import { YoutubeQuotaService } from '../youtube/youtube-quota.service';

function fakeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'u1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    avatarUrl: null,
    role: 'user',
    isDisabled: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    googleId: 'g-1',
    refreshTokenHash: null,
    ...overrides,
  };
}

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    user: Record<string, jest.Mock>;
    promptTemplate: Record<string, jest.Mock>;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let redis: { client: { ping: jest.Mock } };
  let platforms: jest.Mocked<Pick<PlatformsService, 'health'>>;
  let transcriptCanary: jest.Mocked<Pick<TranscriptCanaryJob, 'getLastStatus'>>;
  let videos: jest.Mocked<Pick<VideosService, 'getPipelineMetrics'>>;
  let youtubeQuota: jest.Mocked<Pick<YoutubeQuotaService, 'getUsageToday' | 'getDailyLimit' | 'isThrottled'>>;

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      promptTemplate: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
      $queryRaw: jest.fn(),
      // Default: run the callback against the same mock, i.e. treat the
      // "transaction client" as identical to the top-level one — good
      // enough for asserting call order/args without a real DB.
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    redis = { client: { ping: jest.fn() } };
    platforms = { health: jest.fn() };
    transcriptCanary = { getLastStatus: jest.fn() };
    videos = { getPipelineMetrics: jest.fn() };
    youtubeQuota = { getUsageToday: jest.fn(), getDailyLimit: jest.fn(), isThrottled: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: PlatformsService, useValue: platforms },
        { provide: TranscriptCanaryJob, useValue: transcriptCanary },
        { provide: VideosService, useValue: videos },
        { provide: YoutubeQuotaService, useValue: youtubeQuota },
      ],
    }).compile();

    service = moduleRef.get(AdminService);
  });

  describe('listUsers', () => {
    it('returns page 1 with defaults when no query params are given', async () => {
      prisma.user.findMany.mockResolvedValue([fakeUser()]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers();

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
      expect(result.users).toEqual([
        expect.objectContaining({ id: 'u1', email: 'ada@example.com', isDisabled: false }),
      ]);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
    });

    it('builds a case-insensitive OR filter across name and email when searching', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers('ada', 2, 10);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'ada', mode: 'insensitive' } },
              { email: { contains: 'ada', mode: 'insensitive' } },
            ],
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('serializes createdAt to an ISO string and never leaks refreshTokenHash', async () => {
      prisma.user.findMany.mockResolvedValue([fakeUser({ refreshTokenHash: 'super-secret-hash' })]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers();

      expect(result.users[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.users[0]).not.toHaveProperty('refreshTokenHash');
    });
  });

  describe('setUserDisabled', () => {
    it('throws NotFoundException when the target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setUserDisabled('admin-1', 'ghost', true)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates isDisabled and returns the updated row', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(fakeUser({ id: 'u2', isDisabled: true }));

      const result = await service.setUserDisabled('admin-1', 'u2', true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: { isDisabled: true },
      });
      expect(result.isDisabled).toBe(true);
    });

    it('refuses to let an admin disable their own account', async () => {
      await expect(service.setUserDisabled('admin-1', 'admin-1', true)).rejects.toThrow(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('allows an admin to re-enable their own account (only disabling self is blocked)', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 'admin-1', isDisabled: true }));
      prisma.user.update.mockResolvedValue(fakeUser({ id: 'admin-1', isDisabled: false }));

      const result = await service.setUserDisabled('admin-1', 'admin-1', false);

      expect(result.isDisabled).toBe(false);
    });
  });

  describe('platformHealth', () => {
    const healthyCodeforces = {
      reachable: true,
      lastSuccessfulSyncAt: '2026-07-06T10:00:00.000Z',
      lastError: null,
      checkedAt: '2026-07-06T12:00:00.000Z',
    };
    const healthyCanary = {
      lastCheckedAt: '2026-07-06T11:00:00.000Z',
      healthy: true,
      health: 'healthy' as const,
      detail: 'Transcript fetch OK, detected language: en',
    };

    it('aggregates all four dependency checks and reports not degraded when everything is healthy', async () => {
      platforms.health.mockResolvedValue(healthyCodeforces);
      transcriptCanary.getLastStatus.mockResolvedValue(healthyCanary);
      redis.client.ping.mockResolvedValue('PONG');
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.platformHealth();

      expect(result.degraded).toBe(false);
      expect(result.codeforces).toEqual(healthyCodeforces);
      expect(result.transcriptCanary).toEqual({
        health: 'healthy',
        detail: healthyCanary.detail,
        lastCheckedAt: healthyCanary.lastCheckedAt,
      });
      expect(result.redis.status).toBe('healthy');
      expect(result.database.status).toBe('healthy');
    });

    it('reports the canary as "unknown" (not unhealthy) when it has never run', async () => {
      platforms.health.mockResolvedValue(healthyCodeforces);
      transcriptCanary.getLastStatus.mockResolvedValue(null);
      redis.client.ping.mockResolvedValue('PONG');
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.platformHealth();

      expect(result.transcriptCanary.health).toBe('unknown');
      expect(result.degraded).toBe(false);
    });

    it('marks Redis as down when the ping throws, and surfaces the error detail', async () => {
      platforms.health.mockResolvedValue(healthyCodeforces);
      transcriptCanary.getLastStatus.mockResolvedValue(healthyCanary);
      redis.client.ping.mockRejectedValue(new Error('ECONNREFUSED'));
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.platformHealth();

      expect(result.redis.status).toBe('down');
      expect(result.redis.detail).toContain('ECONNREFUSED');
      expect(result.degraded).toBe(true);
    });

    it('marks the database as down when the query throws', async () => {
      platforms.health.mockResolvedValue(healthyCodeforces);
      transcriptCanary.getLastStatus.mockResolvedValue(healthyCanary);
      redis.client.ping.mockResolvedValue('PONG');
      prisma.$queryRaw.mockRejectedValue(new Error('connection terminated'));

      const result = await service.platformHealth();

      expect(result.database.status).toBe('down');
      expect(result.degraded).toBe(true);
    });

    it('propagates degraded=true when Codeforces itself is unreachable', async () => {
      platforms.health.mockResolvedValue({ ...healthyCodeforces, reachable: false });
      transcriptCanary.getLastStatus.mockResolvedValue(healthyCanary);
      redis.client.ping.mockResolvedValue('PONG');
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.platformHealth();

      expect(result.degraded).toBe(true);
    });
  });

  describe('videoPipelineMetrics', () => {
    it('combines quota, cache, and queue stats from their respective sources', async () => {
      youtubeQuota.getUsageToday.mockResolvedValue(1234);
      youtubeQuota.getDailyLimit.mockReturnValue(10_000);
      youtubeQuota.isThrottled.mockResolvedValue(false);
      videos.getPipelineMetrics.mockResolvedValue({
        cache: { hits: 30, misses: 10, hitRate: 75 },
        queue: { size: 5, pendingJobs: 3, activeJobs: 2, failedJobs: 1 },
      });

      const result = await service.videoPipelineMetrics();

      expect(result.youtube).toEqual({ quotaUsedToday: 1234, quotaLimit: 10_000, quotaThrottled: false });
      expect(result.cache).toEqual({ hits: 30, misses: 10, hitRate: 75 });
      expect(result.queue).toEqual({ size: 5, pendingJobs: 3, activeJobs: 2, failedJobs: 1 });
      expect(result.checkedAt).toEqual(expect.any(String));
    });

    it('reports quotaThrottled=true once usage crosses the 80% line', async () => {
      youtubeQuota.getUsageToday.mockResolvedValue(8500);
      youtubeQuota.getDailyLimit.mockReturnValue(10_000);
      youtubeQuota.isThrottled.mockResolvedValue(true);
      videos.getPipelineMetrics.mockResolvedValue({
        cache: { hits: 0, misses: 0, hitRate: null },
        queue: { size: 0, pendingJobs: 0, activeJobs: 0, failedJobs: 0 },
      });

      const result = await service.videoPipelineMetrics();

      expect(result.youtube.quotaThrottled).toBe(true);
    });

    it('passes through a null hitRate when no searches have been cached today', async () => {
      youtubeQuota.getUsageToday.mockResolvedValue(0);
      youtubeQuota.getDailyLimit.mockReturnValue(10_000);
      youtubeQuota.isThrottled.mockResolvedValue(false);
      videos.getPipelineMetrics.mockResolvedValue({
        cache: { hits: 0, misses: 0, hitRate: null },
        queue: { size: 0, pendingJobs: 0, activeJobs: 0, failedJobs: 0 },
      });

      const result = await service.videoPipelineMetrics();

      expect(result.cache.hitRate).toBeNull();
    });
  });

  describe('listPromptTemplates', () => {
    function fakeTemplate(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 't1',
        type: 'hint',
        version: 1,
        body: 'hint v1 body',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
      };
    }

    it('groups templates by type, each already sorted newest-version-first by the query', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([
        fakeTemplate({ id: 'd2', type: 'debug', version: 2, isActive: true }),
        fakeTemplate({ id: 'd1', type: 'debug', version: 1, isActive: false }),
        fakeTemplate({ id: 'h1', type: 'hint', version: 1, isActive: true }),
      ]);

      const result = await service.listPromptTemplates();

      expect(prisma.promptTemplate.findMany).toHaveBeenCalledWith({
        orderBy: [{ type: 'asc' }, { version: 'desc' }],
      });
      expect(result.debug.map((t) => t.version)).toEqual([2, 1]);
      expect(result.hint.map((t) => t.version)).toEqual([1]);
    });

    it('serializes createdAt to an ISO string', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([fakeTemplate()]);

      const result = await service.listPromptTemplates();

      expect(result.hint[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns empty arrays for a type with no templates yet', async () => {
      prisma.promptTemplate.findMany.mockResolvedValue([]);

      const result = await service.listPromptTemplates();

      expect(result.hint).toEqual([]);
      expect(result.debug).toEqual([]);
    });
  });

  describe('updateActivePromptTemplate', () => {
    it('creates version 1 when no template of that type exists yet', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue(null);
      prisma.promptTemplate.create.mockResolvedValue({
        id: 'h1',
        type: 'hint',
        version: 1,
        body: 'new hint body',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.updateActivePromptTemplate('hint', 'new hint body');

      expect(prisma.promptTemplate.updateMany).toHaveBeenCalledWith({
        where: { type: 'hint', isActive: true },
        data: { isActive: false },
      });
      expect(prisma.promptTemplate.create).toHaveBeenCalledWith({
        data: { type: 'hint', version: 1, body: 'new hint body', isActive: true },
      });
      expect(result.version).toBe(1);
      expect(result.isActive).toBe(true);
    });

    it('increments from the current highest version rather than overwriting it', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue({
        id: 'd2',
        type: 'debug',
        version: 2,
        body: 'old debug body',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.promptTemplate.create.mockResolvedValue({
        id: 'd3',
        type: 'debug',
        version: 3,
        body: 'new debug body',
        isActive: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.updateActivePromptTemplate('debug', 'new debug body');

      expect(prisma.promptTemplate.findFirst).toHaveBeenCalledWith({
        where: { type: 'debug' },
        orderBy: { version: 'desc' },
      });
      expect(prisma.promptTemplate.create).toHaveBeenCalledWith({
        data: { type: 'debug', version: 3, body: 'new debug body', isActive: true },
      });
      expect(result.version).toBe(3);
    });

    it('deactivates the previously-active row and creates the new one inside a single transaction', async () => {
      prisma.promptTemplate.findFirst.mockResolvedValue({
        id: 'h1',
        type: 'hint',
        version: 1,
        body: 'old',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.promptTemplate.create.mockResolvedValue({
        id: 'h2',
        type: 'hint',
        version: 2,
        body: 'new',
        isActive: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await service.updateActivePromptTemplate('hint', 'new');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.promptTemplate.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.promptTemplate.create).toHaveBeenCalledTimes(1);
    });
  });
});
