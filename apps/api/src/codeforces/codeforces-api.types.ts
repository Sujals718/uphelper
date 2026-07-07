// Shapes returned by Codeforces' public API (https://codeforces.com/apiHelp).
// Deliberately minimal — only the fields this app actually reads. These are
// NOT our domain models (Problem/Contest/etc. in Prisma); they're the raw
// wire format, kept separate so a Codeforces API quirk never leaks into our
// own schema types.

export interface CfApiEnvelope<T> {
  status: 'OK' | 'FAILED';
  result?: T;
  comment?: string;
}

export interface CfUserInfo {
  handle: string;
  rating?: number;
}

export interface CfProblem {
  contestId?: number;
  index: string;
  name: string;
  tags: string[];
  rating?: number;
}

export interface CfSubmissionParty {
  // 'CONTESTANT' = genuine, official contest participation.
  // 'PRACTICE' | 'VIRTUAL' | 'OUT_OF_COMPETITION' = not a real contest
  // attempt, and deliberately excluded from solved/total counts below —
  // otherwise a problem solved days later during upsolving would falsely
  // count as "solved during the contest."
  participantType: 'CONTESTANT' | 'PRACTICE' | 'VIRTUAL' | 'MANAGER' | 'OUT_OF_COMPETITION';
  members: Array<{ handle: string }>;
}

export interface CfSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  problem: CfProblem;
  author: CfSubmissionParty;
  verdict?: string; // 'OK' | 'WRONG_ANSWER' | 'TIME_LIMIT_EXCEEDED' | ... | undefined while judging
}

export interface CfContest {
  id: number;
  name: string;
  startTimeSeconds?: number;
}
