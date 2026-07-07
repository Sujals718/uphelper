import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildWeaknessHeatmap, WeaknessHeatmapEntry } from './weakness-heatmap.util';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async weaknessHeatmap(userId: string): Promise<WeaknessHeatmapEntry[]> {
    const [mistakes, unsolvedParticipations] = await Promise.all([
      this.prisma.mistake.findMany({
        where: { userId },
        include: { problem: true },
      }),
      this.prisma.contestParticipation.findMany({
        where: { platformAccount: { userId }, unsolvedProblemId: { not: null } },
        include: { unsolvedProblem: true },
      }),
    ]);

    // A mistake's own `tags` array is the user's own characterization of
    // what went wrong, so it wins when present. Only fall back to the
    // linked problem's tags when the user left `tags` empty — otherwise a
    // mistake logged without manual tagging would contribute nothing at
    // all, even though it's tied to a problem that clearly has tags.
    const mistakeTagSets = mistakes.map((m) => (m.tags.length > 0 ? m.tags : (m.problem?.tags ?? [])));

    
    const seenProblemIds = new Set<string>();
    const unsolvedTagSets: string[][] = [];
    for (const p of unsolvedParticipations) {
      const problem = p.unsolvedProblem;
      if (!problem || seenProblemIds.has(problem.id)) continue;
      seenProblemIds.add(problem.id);
      unsolvedTagSets.push(problem.tags);
    }

    return buildWeaknessHeatmap(mistakeTagSets, unsolvedTagSets);
  }
}
