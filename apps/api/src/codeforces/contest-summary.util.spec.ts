import { buildContestSummaries } from './contest-summary.util';
import type { CfContest, CfProblem, CfSubmission } from './codeforces-api.types';

function submission(overrides: Partial<CfSubmission>): CfSubmission {
  return {
    id: Math.floor(Math.random() * 1e9),
    contestId: 1002,
    creationTimeSeconds: 1_700_000_000,
    problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: ['greedy'] },
    author: { participantType: 'CONTESTANT', members: [{ handle: 'tester' }] },
    verdict: 'OK',
    ...overrides,
  };
}

const contestsById = new Map<number, CfContest>([
  [1002, { id: 1002, name: 'Codeforces Round 1002', startTimeSeconds: 1_700_000_000 }],
  [999, { id: 999, name: 'Codeforces Round 999', startTimeSeconds: 1_690_000_000 }],
]);

describe('buildContestSummaries', () => {
  it('counts solved/total correctly and picks the highest-index unsolved-but-attempted problem', () => {
    const submissions: CfSubmission[] = [
      submission({ problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] }, verdict: 'OK' }),
      submission({ problem: { contestId: 1002, index: 'B', name: 'Prefix Sums', tags: [] }, verdict: 'OK' }),
      submission({ problem: { contestId: 1002, index: 'C', name: 'Graph Trouble', tags: ['graphs'] }, verdict: 'WRONG_ANSWER' }),
      submission({ problem: { contestId: 1002, index: 'D', name: 'Hard One', tags: [] }, verdict: 'WRONG_ANSWER' }),
    ];
    const problemsByContest = new Map<number, CfProblem[]>([
      [1002, [
        { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] },
        { contestId: 1002, index: 'B', name: 'Prefix Sums', tags: [] },
        { contestId: 1002, index: 'C', name: 'Graph Trouble', tags: [] },
        { contestId: 1002, index: 'D', name: 'Hard One', tags: [] },
        { contestId: 1002, index: 'E', name: 'Never Touched', tags: [] },
      ]],
    ]);

    const [summary] = buildContestSummaries(submissions, problemsByContest, contestsById);

    expect(summary.problemsSolved).toBe(2);
    expect(summary.totalProblems).toBe(5); // includes E, which was never attempted
    expect(summary.unsolvedProblem?.index).toBe('D'); // highest attempted-but-unsolved, not C
    expect(summary.attemptedProblems).toHaveLength(4); // E excluded — never attempted
  });

  it('excludes practice/virtual/out-of-competition submissions from solved/total', () => {
    const submissions: CfSubmission[] = [
      submission({
        problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] },
        verdict: 'OK',
        author: { participantType: 'PRACTICE', members: [{ handle: 'tester' }] },
      }),
    ];
    const summaries = buildContestSummaries(submissions, new Map(), contestsById);
    expect(summaries).toHaveLength(0);
  });

  it('returns null unsolvedProblem when every attempted problem was solved', () => {
    const submissions: CfSubmission[] = [
      submission({ problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] }, verdict: 'OK' }),
    ];
    const [summary] = buildContestSummaries(submissions, new Map(), contestsById);
    expect(summary.unsolvedProblem).toBeNull();
    expect(summary.problemsSolved).toBe(1);
  });

  it('falls back to attempted-problem count when the contest is missing from the global problemset', () => {
    const submissions: CfSubmission[] = [
      submission({ problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] }, verdict: 'WRONG_ANSWER' }),
      submission({ problem: { contestId: 1002, index: 'B', name: 'Prefix Sums', tags: [] }, verdict: 'OK' }),
    ];
    const [summary] = buildContestSummaries(submissions, new Map(), contestsById);
    expect(summary.totalProblems).toBe(2); // no problemset entry -> falls back to attempted count
  });

  it('produces one summary per distinct contest and sorts newest-first', () => {
    const submissions: CfSubmission[] = [
      submission({ contestId: 999, problem: { contestId: 999, index: 'A', name: 'Old One', tags: [] }, verdict: 'OK' }),
      submission({ contestId: 1002, problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] }, verdict: 'OK' }),
    ];
    const summaries = buildContestSummaries(submissions, new Map(), contestsById);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].contestExternalId).toBe('1002'); // newer startTime first
    expect(summaries[1].contestExternalId).toBe('999');
  });

  it('treats a submission with no verdict yet (still judging) as not solved', () => {
    const submissions: CfSubmission[] = [
      submission({ problem: { contestId: 1002, index: 'A', name: 'Two Arrays', tags: [] }, verdict: undefined }),
    ];
    const [summary] = buildContestSummaries(submissions, new Map(), contestsById);
    expect(summary.problemsSolved).toBe(0);
    expect(summary.unsolvedProblem?.index).toBe('A');
  });
});
