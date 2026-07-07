import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformsService } from './platforms.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CodeforcesClient } from '../codeforces/codeforces-client.service';

describe('PlatformsService', () => {
  let service: PlatformsService;
  let prisma: {
    platformAccount: Record<string, jest.Mock>;
    contest: Record<string, jest.Mock>;
    problem: Record<string, jest.Mock>;
    contestParticipation: Record<string, jest.Mock>;
  };
  let cf: jest.Mocked<
    Pick<CodeforcesClient, 'verifyHandle' | 'getUserSubmissions' | 'getAllProblems' | 'getContestList' | 'ping'>
  >;
  let redis: { client: { get: jest.Mock; set: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      platformAccount: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      contest: { upsert: jest.fn() },
      problem: { upsert: jest.fn() },
      contestParticipation: { upsert: jest.fn(), findMany: jest.fn() },
    };
    cf = {
      verifyHandle: jest.fn(),
      getUserSubmissions: jest.fn(),
      getAllProblems: jest.fn(),
      getContestList: jest.fn(),
      ping: jest.fn(),
    };
    redis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlatformsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CodeforcesClient, useValue: cf },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(PlatformsService);
  });

  describe('unsupported platforms', () => {
    it('rejects link() for anything other than codeforces', async () => {
      await expect(service.link('u1', 'leetcode', 'someone')).rejects.toThrow(BadRequestException);
      expect(cf.verifyHandle).not.toHaveBeenCalled();
    });

    it('rejects sync() for anything other than codeforces', async () => {
      await expect(service.sync('u1', 'atcoder')).rejects.toThrow(BadRequestException);
    });
  });

  describe('link', () => {
    it('verifies the handle against the real API before storing it', async () => {
      cf.verifyHandle.mockResolvedValue({ handle: 'tourist' });
      prisma.platformAccount.upsert.mockResolvedValue({ id: 'acc-1' });

      await service.link('u1', 'codeforces', 'tourist');

      expect(cf.verifyHandle).toHaveBeenCalledWith('tourist');
      expect(prisma.platformAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_platform: { userId: 'u1', platform: 'codeforces' } },
        }),
      );
    });

    it('never stores the handle if verification throws', async () => {
      cf.verifyHandle.mockRejectedValue(new NotFoundException('handle not found'));
      await expect(service.link('u1', 'codeforces', 'ghost')).rejects.toThrow(NotFoundException);
      expect(prisma.platformAccount.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unlink', () => {
    it('throws NotFoundException when nothing is linked', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue(null);
      await expect(service.unlink('u1', 'codeforces')).rejects.toThrow(NotFoundException);
      expect(prisma.platformAccount.delete).not.toHaveBeenCalled();
    });
  });

  describe('sync', () => {
    it('throws NotFoundException if the handle was never linked', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue(null);
      await expect(service.sync('u1', 'codeforces')).rejects.toThrow(NotFoundException);
    });

    it('fetches submissions + both global catalogs, upserts per contest, and marks the account synced', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue({ id: 'acc-1', handle: 'tourist' });
      cf.getUserSubmissions.mockResolvedValue([
        {
          id: 1,
          contestId: 1002,
          creationTimeSeconds: 1_700_000_000,
          problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] },
          author: { participantType: 'CONTESTANT', members: [{ handle: 'tourist' }] },
          verdict: 'OK',
        },
      ]);
      cf.getAllProblems.mockResolvedValue([
        { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] },
      ]);
      cf.getContestList.mockResolvedValue([
        { id: 1002, name: 'Codeforces Round 1002', startTimeSeconds: 1_700_000_000 },
      ]);
      prisma.contest.upsert.mockResolvedValue({ id: 'contest-1' });
      prisma.problem.upsert.mockResolvedValue({ id: 'problem-1' });
      prisma.contestParticipation.upsert.mockResolvedValue({});
      prisma.platformAccount.update.mockResolvedValue({});

      const result = await service.sync('u1', 'codeforces');

      expect(result).toEqual({ contestsSynced: 1 });
      expect(prisma.contest.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.contestParticipation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ problemsSolved: 1, totalProblems: 1 }),
        }),
      );
      expect(prisma.platformAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: expect.objectContaining({ verified: true }),
      });
    });
  });

  describe('getContests', () => {
    it('returns an empty array rather than throwing when nothing is linked', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue(null);
      await expect(service.getContests('u1', 'codeforces')).resolves.toEqual([]);
    });
  });

  describe('status', () => {
    it('reports codeforces reachability from the client ping', async () => {
      cf.ping.mockResolvedValue(true);
      const result = await service.status();
      expect(result.codeforces.reachable).toBe(true);
    });
  });

  describe('health', () => {
    it('reports reachable + last successful sync + null lastError when nothing has ever failed', async () => {
      cf.ping.mockResolvedValue(true);
      prisma.platformAccount.findFirst.mockResolvedValue({ lastSyncedAt: new Date('2026-07-06T10:00:00.000Z') });
      redis.client.get.mockResolvedValue(null);

      const result = await service.health();

      expect(result).toEqual(
        expect.objectContaining({
          reachable: true,
          lastSuccessfulSyncAt: '2026-07-06T10:00:00.000Z',
          lastError: null,
        }),
      );
    });

    it('surfaces the last recorded sync error from Redis when present', async () => {
      cf.ping.mockResolvedValue(true);
      prisma.platformAccount.findFirst.mockResolvedValue(null);
      redis.client.get.mockResolvedValue(
        JSON.stringify({ message: 'Codeforces API timed out', occurredAt: '2026-07-06T09:00:00.000Z' }),
      );

      const result = await service.health();

      expect(result.lastSuccessfulSyncAt).toBeNull();
      expect(result.lastError).toEqual({
        message: 'Codeforces API timed out',
        occurredAt: '2026-07-06T09:00:00.000Z',
      });
    });

    it('reports unreachable when the ping fails', async () => {
      cf.ping.mockResolvedValue(false);
      prisma.platformAccount.findFirst.mockResolvedValue(null);
      redis.client.get.mockResolvedValue(null);

      const result = await service.health();

      expect(result.reachable).toBe(false);
    });
  });

  describe('sync failure recording', () => {
    it('persists the error to Redis and rethrows when an external call fails', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue({ id: 'acc-1', handle: 'tourist' });
      cf.getUserSubmissions.mockRejectedValue(new Error('Codeforces API unreachable'));
      cf.getAllProblems.mockResolvedValue([]);
      cf.getContestList.mockResolvedValue([]);

      await expect(service.sync('u1', 'codeforces')).rejects.toThrow('Codeforces API unreachable');

      expect(redis.client.set).toHaveBeenCalledWith(
        'platform-health:codeforces:last-error',
        expect.stringContaining('Codeforces API unreachable'),
      );
    });

    it('does NOT record a Redis error for a plain "not linked" failure', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue(null);

      await expect(service.sync('u1', 'codeforces')).rejects.toThrow(NotFoundException);

      expect(redis.client.set).not.toHaveBeenCalled();
    });

    it('does not let a Redis write failure mask the original sync error', async () => {
      prisma.platformAccount.findUnique.mockResolvedValue({ id: 'acc-1', handle: 'tourist' });
      cf.getUserSubmissions.mockRejectedValue(new Error('Codeforces API unreachable'));
      cf.getAllProblems.mockResolvedValue([]);
      cf.getContestList.mockResolvedValue([]);
      redis.client.set.mockRejectedValue(new Error('Redis is down'));

      await expect(service.sync('u1', 'codeforces')).rejects.toThrow('Codeforces API unreachable');
    });
  });
});
