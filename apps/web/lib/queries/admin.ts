"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminPromptTemplatesResponse,
  AdminPromptTemplateType,
  AdminPromptTemplateVersion,
  AdminUsersResponse,
  PlatformHealthResponse,
  VideoPipelineMetrics,
} from "@uphelper/shared-types";
import { apiFetch } from "../api-client";


export function useAdminUsers(search: string) {
  const trimmed = search.trim();
  return useQuery({
    queryKey: ["admin", "users", trimmed],
    queryFn: () => {
      const params = new URLSearchParams();
      if (trimmed) params.set("search", trimmed);
      const qs = params.toString();
      return apiFetch<AdminUsersResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
    },
  });
}

/**
 * PATCH /admin/users/:id — toggles isDisabled only, same generic
 * useMutation + invalidate pattern as useUpdateMistake/useSyncPlatform.
 * Invalidates every ["admin", "users", ...] query (any search term),
 * not just the current one, since the same user row could be visible
 * under a different search term next time.
 */
export function useSetUserDisabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isDisabled }: { id: string; isDisabled: boolean }) =>
      apiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ isDisabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export type {
  PlatformHealthResponse,
  CodeforcesHealth,
  DependencyHealth,
  TranscriptCanaryStatus,
} from "@uphelper/shared-types";

/**
 * GET /admin/platform-health — polled every 30s so the dashboard stays
 * reasonably current without the person needing to manually refresh,
 * same `refetchInterval` pattern as `usePlatformStatus()` in
 * queries/platforms.ts (there: 60s, for a public/non-admin health check;
 * here: 30s, since this is the page an admin actually watches during an
 * incident).
 */
export function useAdminPlatformHealth() {
  return useQuery({
    queryKey: ["admin", "platform-health"],
    queryFn: () => apiFetch<PlatformHealthResponse>("/admin/platform-health"),
    refetchInterval: 30_000,
  });
}


export function useAdminVideoPipelineMetrics() {
  return useQuery({
    queryKey: ["admin", "video-pipeline-metrics"],
    queryFn: () => apiFetch<VideoPipelineMetrics>("/admin/video-pipeline-metrics"),
    refetchInterval: 30_000,
  });
}


/** No polling here (unlike platform-health/pipeline-metrics) — template
 * bodies don't change on their own between admin edits, so refetching on
 * an interval would just be wasted requests. `useUpdatePromptTemplate`'s
 * `onSuccess` invalidation is what keeps this fresh after a real edit. */
export function useAdminPromptTemplates() {
  return useQuery({
    queryKey: ["admin", "prompt-templates"],
    queryFn: () => apiFetch<AdminPromptTemplatesResponse>("/admin/prompt-templates"),
  });
}

export function useUpdatePromptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, body }: { type: AdminPromptTemplateType; body: string }) =>
      apiFetch<AdminPromptTemplateVersion>("/admin/prompt-templates", {
        method: "PATCH",
        body: JSON.stringify({ type, body }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "prompt-templates"] }),
  });
}
