import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

// The pure aggregation logic (weakness-heatmap.util.spec.ts) already covers
// buildWeaknessHeatmap itself. What's specific to AnalyticsService and worth
// testing separately is the two bits of glue around it: falling back to a
// linked problem's tags when a mistake wasn't manually tagged, and
// de-duplicating a Problem that shows up as "unsolved" in more than one
// contest_participation row.
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    mistake: { findMany: jest.Mock };
    contestParticipation: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      mistake: { findMany: jest.fn() },
      contestParticipation: { findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AnalyticsService);
  });

  it('scopes both queries to the calling user', async () => {
    prisma.mistake.findMany.mockResolvedValue([]);
    prisma.contestParticipation.findMany.mockResolvedValue([]);

    await service.weaknessHeatmap('u1');

    expect(prisma.mistake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prisma.contestParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformAccount: { userId: 'u1' }, unsolvedProblemId: { not: null } },
      }),
    );
  });

  it("uses the mistake's own tags when present, ignoring the linked problem's tags", async () => {
    prisma.mistake.findMany.mockResolvedValue([
      { tags: ['off-by-one'], problem: { id: 'p1', tags: ['graphs', 'dp'] } },
    ]);
    prisma.contestParticipation.findMany.mockResolvedValue([]);

    const result = await service.weaknessHeatmap('u1');

    expect(result).toEqual([{ tag: 'off-by-one', mistakeCount: 1, unsolvedCount: 0, total: 1 }]);
  });

  it('falls back to the linked problem tags when a mistake has no tags of its own', async () => {
    prisma.mistake.findMany.mockResolvedValue([{ tags: [], problem: { id: 'p1', tags: ['graphs', 'dp'] } }]);
    prisma.contestParticipation.findMany.mockResolvedValue([]);

    const result = await service.weaknessHeatmap('u1');

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: 'graphs', mistakeCount: 1 }),
        expect.objectContaining({ tag: 'dp', mistakeCount: 1 }),
      ]),
    );
  });

  it('contributes nothing for a tagless mistake with no linked problem', async () => {
    prisma.mistake.findMany.mockResolvedValue([{ tags: [], problem: null }]);
    prisma.contestParticipation.findMany.mockResolvedValue([]);

    const result = await service.weaknessHeatmap('u1');

    expect(result).toEqual([]);
  });

  it('counts the same unsolved problem only once even if it appears in two contest rows', async () => {
    prisma.mistake.findMany.mockResolvedValue([]);
    prisma.contestParticipation.findMany.mockResolvedValue([
      { unsolvedProblem: { id: 'p1', tags: ['greedy'] } },
      { unsolvedProblem: { id: 'p1', tags: ['greedy'] } }, // same problem, e.g. a later practice contest
    ]);

    const result = await service.weaknessHeatmap('u1');

    expect(result).toEqual([{ tag: 'greedy', mistakeCount: 0, unsolvedCount: 1, total: 1 }]);
  });
});