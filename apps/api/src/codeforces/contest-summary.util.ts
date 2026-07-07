import type { CfContest, CfProblem, CfSubmission } from './codeforces-api.types';

export interface ContestSummaryProblem {
  externalId: string; // "{contestId}{index}", e.g. "1002A"
  index: string;
  name: string;
  tags: string[];
}

export interface ContestSummary {
  contestExternalId: string;
  contestName: string;
  startTime: Date | null;
  totalProblems: number;
  problemsSolved: number;
  /**
   * The single problem to surface as "what you got stuck on," or null if
   * the user solved everything they attempted in this contest. Codeforces
   * contests routinely have several problems a user never even opened —
   * "unsolved" here specifically means "attempted, never got AC," not
   * "every problem in the contest the user didn't solve." Among those, we
   * pick the highest-index one (alphabetically last), since in a typical
   * CF round difficulty rises with index, so the highest attempted-but-
   * unsolved problem is the most likely "this is where I actually got
   * stuck" candidate — not necessarily the true frontier for non-standard
   * problem orderings, but a reasonable, documented default.
   */
  unsolvedProblem: ContestSummaryProblem | null;
  attemptedProblems: ContestSummaryProblem[];
}

/**
 * Turns raw Codeforces submissions into one summary per contest actually
 * attended. Pure function — no I/O, no Prisma, no HTTP — so it can be
 * unit-tested against fixture data,
 * independent of the live Codeforces API being reachable.
 */
export function buildContestSummaries(
  submissions: CfSubmission[],
  problemsByContest: Map<number, CfProblem[]>,
  contestsById: Map<number, CfContest>,
): ContestSummary[] {
  // Only genuine contest participation counts toward solved/total — a
  // problem solved later during practice/virtual/upsolving should not
  // retroactively count as "solved during the contest."
  const contestantSubs = submissions.filter(
    (s) => s.author.participantType === 'CONTESTANT' && s.contestId != null,
  );

  const byContest = new Map<number, CfSubmission[]>();
  for (const s of contestantSubs) {
    const list = byContest.get(s.contestId!) ?? [];
    list.push(s);
    byContest.set(s.contestId!, list);
  }

  const summaries: ContestSummary[] = [];

  for (const [contestId, subs] of byContest) {
    const solvedIndices = new Set<string>();
    const attemptedByIndex = new Map<string, CfSubmission>();

    for (const s of subs) {
      // Keep the latest-seen submission per index; verdict tracking below
      // doesn't depend on which one we keep, only on whether ANY OK exists.
      attemptedByIndex.set(s.problem.index, s);
      if (s.verdict === 'OK') solvedIndices.add(s.problem.index);
    }

    const contestProblems = problemsByContest.get(contestId) ?? [];
    // Fall back to "however many distinct problems we saw submissions for"
    // if this contest isn't in the global problemset yet (e.g. brand new
    // contest not indexed, or a gym contest) — degrade to a smaller-but-
    // correct number rather than failing the whole sync.
    const totalProblems = contestProblems.length || attemptedByIndex.size;

    const unsolvedIndex = [...attemptedByIndex.keys()]
      .filter((idx) => !solvedIndices.has(idx))
      .sort()
      .reverse()[0];
    const unsolvedSub = unsolvedIndex ? attemptedByIndex.get(unsolvedIndex) : undefined;

    const meta = contestsById.get(contestId);

    const toSummaryProblem = (s: CfSubmission): ContestSummaryProblem => ({
      externalId: `${contestId}${s.problem.index}`,
      index: s.problem.index,
      name: s.problem.name,
      tags: s.problem.tags ?? [],
    });

    summaries.push({
      contestExternalId: String(contestId),
      contestName: meta?.name ?? `Contest ${contestId}`,
      startTime: meta?.startTimeSeconds ? new Date(meta.startTimeSeconds * 1000) : null,
      totalProblems,
      problemsSolved: solvedIndices.size,
      unsolvedProblem: unsolvedSub ? toSummaryProblem(unsolvedSub) : null,
      attemptedProblems: [...attemptedByIndex.values()].map(toSummaryProblem),
    });
  }

  return summaries.sort((a, b) => (b.startTime?.getTime() ?? 0) - (a.startTime?.getTime() ?? 0));
}
