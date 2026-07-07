// packages/shared-types/src/revision.ts

export type RevisionStatus = 'pending' | 'done' | 'snoozed';

export interface RevisionProblemRef {
  id: string;
  externalId: string;
  name: string;
  url: string;
}

export interface RevisionItemSummary {
  id: string;
  userId: string;
  problemId: string | null;
  problem?: RevisionProblemRef | null;
  problemName: string;
  selfHint: string | null;
  reminderAt: string | null;
  sm2Repetition: number;
  sm2EaseFactor: number;
  sm2IntervalDays: number;
  nextReviewAt: string | null;
  status: RevisionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRevisionItemRequest {
  problemId?: string;
  problemName: string;
  selfHint?: string;
  reminderAt?: string; // ISO 8601
}

export interface UpdateRevisionItemRequest {
  problemName?: string;
  selfHint?: string;
  reminderAt?: string;
  status?: RevisionStatus;
  grade?: number; // 0-5, classic SM-2 quality-of-recall scale

  sm2Repetition?: number;
  sm2EaseFactor?: number;
  sm2IntervalDays?: number;
  nextReviewAt?: string; // ISO 8601 — the SM-2-derived schedule date, distinct from reminderAt
}
