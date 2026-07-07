import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CodeforcesClient } from '../codeforces/codeforces-client.service';
import { buildContestSummaries } from '../codeforces/contest-summary.util';
import type { CfProblem } from '../codeforces/codeforces-api.types';
import type { CodeforcesHealth } from '@uphelper/shared-types';

// Shape persisted under LAST_SYNC_ERROR_KEY. Kept local rather than in
// shared-types since it's an internal Redis payload shape, not something
// any client directly consumes — AdminService reads it back out and maps
// it onto CodeforcesHealth['lastError'], which IS the shared-types shape.
interface PersistedSyncError {
  message: string;
  occurredAt: string;
}

// Only value this app currently accepts. Kept as a plain constant/string
// check rather than an enum or a platform-registry abstraction — see the
// build spec's "no PlatformAdapter for one implementation" call.
const SUPPORTED_PLATFORMS = new Set(['codeforces']);

// Admin Panel support: sync() is per-user and on-demand,
// there's no scheduled job wrapping every call, so this is the one place a
// real sync failure actually happens — recording it here (global key, not
// per-user) is what lets GET /admin/platform-health show "last known
// error" instead of nothing at all. Same Redis-as-status-board pattern
// TranscriptCanaryJob already uses for its own status key.
const LAST_SYNC_ERROR_KEY = 'platform-health:codeforces:last-error';

@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cf: CodeforcesClient,
    private readonly redis: RedisService,
  ) {}

  private assertSupported(platform: string): void {
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      throw new BadRequestException(
        `Unsupported platform "${platform}" — only "codeforces" is supported right now`,
      );
    }
  }

  /**
   * Verifies the handle actually exists on Codeforces before storing it —
   * fails fast with a clear "handle not found" rather than storing garbage
   * that only surfaces as a confusing failure on the next sync.
   */
  async link(userId: string, platform: string, handle: string) {
    this.assertSupported(platform);
    await this.cf.verifyHandle(handle);

    return this.prisma.platformAccount.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, handle, verified: true },
      update: { handle, verified: true },
    });
  }

  async unlink(userId: string, platform: string): Promise<void> {
    this.assertSupported(platform);
    const account = await this.prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) {
      throw new NotFoundException('No linked account for this platform');
    }
    // Cascades to contest_participation rows via the FK, but Contest and
    // Problem rows stay — they're global catalog data shared across users,
    // not owned by this one account.
    await this.prisma.platformAccount.delete({ where: { id: account.id } });
  }

  /**
   * Full sync: pulls the user's submissions plus the two global CF
   * catalogs (all problems, all contests) in parallel, aggregates them
   * with the pure `buildContestSummaries` function, then upserts
   * Contest/Problem/ContestParticipation rows for every contest actually
   * attended — not just the latest one.
   */
  async sync(userId: string, platform: string) {
    this.assertSupported(platform);

    const account = await this.prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) {
      throw new NotFoundException('Link a handle before syncing');
    }

    
    try {
      const [submissions, allProblems, contests] = await Promise.all([
        this.cf.getUserSubmissions(account.handle),
        this.cf.getAllProblems(),
        this.cf.getContestList(),
      ]);

      const problemsByContest = new Map<number, CfProblem[]>();
      for (const p of allProblems) {
        if (p.contestId == null) continue;
        const list = problemsByContest.get(p.contestId) ?? [];
        list.push(p);
        problemsByContest.set(p.contestId, list);
      }
      const contestsById = new Map(contests.map((c) => [c.id, c]));

      const summaries = buildContestSummaries(submissions, problemsByContest, contestsById);

      for (const summary of summaries) {
        const contestRow = await this.prisma.contest.upsert({
          where: { platform_externalId: { platform, externalId: summary.contestExternalId } },
          create: {
            platform,
            externalId: summary.contestExternalId,
            name: summary.contestName,
            startTime: summary.startTime,
            totalProblems: summary.totalProblems,
          },
          update: {
            name: summary.contestName,
            totalProblems: summary.totalProblems,
          },
        });

        let unsolvedProblemId: string | null = null;
        for (const p of summary.attemptedProblems) {
          const problemRow = await this.prisma.problem.upsert({
            where: { platform_externalId: { platform, externalId: p.externalId } },
            create: {
              platform,
              externalId: p.externalId,
              name: p.name,
              url: `https://codeforces.com/contest/${summary.contestExternalId}/problem/${p.index}`,
              tags: p.tags,
            },
            update: { name: p.name, tags: p.tags },
          });
          if (summary.unsolvedProblem?.externalId === p.externalId) {
            unsolvedProblemId = problemRow.id;
          }
        }

        await this.prisma.contestParticipation.upsert({
          where: {
            platformAccountId_contestId: {
              platformAccountId: account.id,
              contestId: contestRow.id,
            },
          },
          create: {
            platformAccountId: account.id,
            contestId: contestRow.id,
            problemsSolved: summary.problemsSolved,
            totalProblems: summary.totalProblems,
            unsolvedProblemId,
            syncedAt: new Date(),
          },
          update: {
            problemsSolved: summary.problemsSolved,
            totalProblems: summary.totalProblems,
            unsolvedProblemId,
            syncedAt: new Date(),
          },
        });
      }

      await this.prisma.platformAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), verified: true },
      });

      this.logger.log(`Synced ${summaries.length} contest(s) for platform_account ${account.id}`);
      return { contestsSynced: summaries.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during Codeforces sync';
      const persisted: PersistedSyncError = { message, occurredAt: new Date().toISOString() };
      // Best-effort: a Redis blip while recording the error must never
      // mask or replace the original sync failure being thrown below.
      await this.redis.client.set(LAST_SYNC_ERROR_KEY, JSON.stringify(persisted)).catch((redisErr) => {
        this.logger.warn(`Failed to persist last sync error to Redis: ${(redisErr as Error).message}`);
      });
      this.logger.error(`Codeforces sync failed for platform_account ${account.id}: ${message}`);
      throw err;
    }
  }

  async getContests(userId: string, platform: string) {
    this.assertSupported(platform);
    const account = await this.prisma.platformAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) return [];

    return this.prisma.contestParticipation.findMany({
      where: { platformAccountId: account.id },
      include: { contest: true, unsolvedProblem: true },
      orderBy: { contest: { startTime: 'desc' } },
    });
  }

  async status() {
    const codeforcesReachable = await this.cf.ping();
    return {
      codeforces: {
        reachable: codeforcesReachable,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  
  async health(): Promise<CodeforcesHealth> {
    const [reachable, mostRecentSync, lastErrorRaw] = await Promise.all([
      this.cf.ping(),
      this.prisma.platformAccount.findFirst({
        where: { lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      }),
      this.redis.client.get(LAST_SYNC_ERROR_KEY),
    ]);

    return {
      reachable,
      lastSuccessfulSyncAt: mostRecentSync?.lastSyncedAt ? mostRecentSync.lastSyncedAt.toISOString() : null,
      lastError: lastErrorRaw ? (JSON.parse(lastErrorRaw) as PersistedSyncError) : null,
      checkedAt: new Date().toISOString(),
    };
  }
}