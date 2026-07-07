// packages/shared-types/src/mistakes.ts
//
// Mirrors what MistakesController actually returns. `problem` is optional
// because MistakesService.list() includes the Problem relation but
// create()/update() don't — a strict type per-endpoint would be more
// "correct" but adds ceremony for no real benefit at this scale; callers
// that need the relation reliably present should refetch the list.

export interface MistakeProblemRef {
  id: string;
  externalId: string;
  name: string;
  url: string;
}

export interface MistakeSummary {
  id: string;
  userId: string;
  problemId: string | null;
  problem?: MistakeProblemRef | null;
  note: string;
  tags: string[];
  createdAt: string;
}

export interface CreateMistakeRequest {
  problemId?: string;
  note: string;
  tags?: string[];
}

export interface UpdateMistakeRequest {
  problemId?: string;
  note?: string;
  tags?: string[];
}
