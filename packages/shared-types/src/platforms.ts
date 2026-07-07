
export interface ProblemSummary {
  id: string;
  externalId: string; // e.g. "1002A"
  name: string;
  url: string;
  tags: string[];
}

export interface ContestParticipationSummary {
  id: string;
  contest: {
    id: string;
    externalId: string;
    name: string;
    startTime: string | null; // ISO string over the wire, not a Date
    totalProblems: number;
  };
  problemsSolved: number;
  totalProblems: number;
  unsolvedProblem: ProblemSummary | null;
  syncedAt: string;
}

export interface PlatformAccountSummary {
  id: string;
  platform: string;
  handle: string;
  verified: boolean;
  lastSyncedAt: string | null;
}

export interface PlatformStatusResponse {
  codeforces: {
    reachable: boolean;
    checkedAt: string;
  };
}

export interface LinkPlatformRequest {
  handle: string;
}

export interface SyncPlatformResponse {
  contestsSynced: number;
}