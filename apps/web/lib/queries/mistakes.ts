"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateMistakeRequest, MistakeSummary, UpdateMistakeRequest } from "@uphelper/shared-types";
import { apiFetch } from "../api-client";

export function useMistakes() {
  return useQuery({
    queryKey: ["mistakes"],
    queryFn: () => apiFetch<MistakeSummary[]>("/mistakes"),
  });
}

export function useCreateMistake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateMistakeRequest) =>
      apiFetch<MistakeSummary>("/mistakes", { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mistakes"] }),
  });
}

export function useUpdateMistake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateMistakeRequest }) =>
      apiFetch<MistakeSummary>(`/mistakes/${id}`, { method: "PATCH", body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mistakes"] }),
  });
}

export function useDeleteMistake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/mistakes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mistakes"] }),
  });
}
