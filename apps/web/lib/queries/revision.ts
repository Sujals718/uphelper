"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRevisionItemRequest,
  RevisionItemSummary,
  RevisionStatus,
  UpdateRevisionItemRequest,
} from "@uphelper/shared-types";
import { apiFetch } from "../api-client";

export function useRevisionItems() {
  return useQuery({
    queryKey: ["revision-items"],
    queryFn: () => apiFetch<RevisionItemSummary[]>("/revision"),
  });
}

export function useCreateRevisionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRevisionItemRequest) =>
      apiFetch<RevisionItemSummary>("/revision", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["revision-items"] }),
  });
}

export function useUpdateRevisionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRevisionItemRequest }) =>
      apiFetch<RevisionItemSummary>(`/revision/${id}`, { method: "PATCH", body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["revision-items"] }),
  });
}

/**
 * Thin semantic wrapper around useUpdateRevisionItem: "completing a
 * review" is just a PATCH whose body is only `{ grade }` — the exact same
 * endpoint as a plain metadata edit, distinguished purely server-side by
 * whether `grade` is present (see RevisionService.update).
 */
export function useCompleteReview() {
  const update = useUpdateRevisionItem();
  return {
    ...update,
    mutate: (vars: { id: string; grade: number }) => update.mutate({ id: vars.id, dto: { grade: vars.grade } }),
    mutateAsync: (vars: { id: string; grade: number }) =>
      update.mutateAsync({ id: vars.id, dto: { grade: vars.grade } }),
  };
}

export interface RevisionSm2Snapshot {
  sm2Repetition: number;
  sm2EaseFactor: number;
  sm2IntervalDays: number;
  nextReviewAt: string;
  status: RevisionStatus;
}

export function useUndoReview() {
  const update = useUpdateRevisionItem();
  return {
    ...update,
    mutate: (vars: { id: string; previous: RevisionSm2Snapshot }) =>
      update.mutate({ id: vars.id, dto: { ...vars.previous } }),
    mutateAsync: (vars: { id: string; previous: RevisionSm2Snapshot }) =>
      update.mutateAsync({ id: vars.id, dto: { ...vars.previous } }),
  };
}

export function useDeleteRevisionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/revision/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["revision-items"] }),
  });
}
