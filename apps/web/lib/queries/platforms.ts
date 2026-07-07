"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ContestParticipationSummary,
  LinkPlatformRequest,
  PlatformStatusResponse,
  SyncPlatformResponse,
} from "@uphelper/shared-types";
import { apiFetch } from "../api-client";

const PLATFORM = "codeforces";

export function useContests() {
  return useQuery({
    queryKey: ["contests"],
    queryFn: () => apiFetch<ContestParticipationSummary[]>(`/platforms/${PLATFORM}/contests`),
  });
}

export function usePlatformStatus() {
  return useQuery({
    queryKey: ["platform-status"],
    queryFn: () => apiFetch<PlatformStatusResponse>("/platforms/status"),
    refetchInterval: 60_000,
  });
}

export function useLinkPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: LinkPlatformRequest) =>
      apiFetch(`/platforms/${PLATFORM}/link`, { method: "POST", body: JSON.stringify(dto) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contests"] }),
  });
}

export function useSyncPlatform() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<SyncPlatformResponse>(`/platforms/${PLATFORM}/sync`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contests"] }),
  });
}
