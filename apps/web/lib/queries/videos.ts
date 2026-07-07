"use client";

import { useMutation } from "@tanstack/react-query";
import type { VideoSearchRequest, VideoSearchResponse } from "@uphelper/shared-types";
import { apiFetch } from "../api-client";

// GET /videos/search is user-triggered (hit "Find videos"), not something
// that should refetch on mount/focus the way useMistakes()/useContests()
// do — so this is a useMutation wrapping a GET, same on-demand shape as
// useLinkPlatform()/useSyncPlatform() in queries/platforms.ts, rather than
// a useQuery with a manually-toggled `enabled` flag.
export function useSearchVideos() {
  return useMutation({
    mutationFn: (req: VideoSearchRequest) => {
      const params = new URLSearchParams({
        problemName: req.problemName,
        platform: req.platform,
        contestName: req.contestName,
        problemCode: req.problemCode,
      });
      return apiFetch<VideoSearchResponse>(`/videos/search?${params.toString()}`);
    },
  });
}

export function useFlagVideoLanguage() {
  return useMutation({
    mutationFn: ({ id, correctedLanguage }: { id: string; correctedLanguage?: string }) =>
      apiFetch<void>(`/videos/${id}/flag-language`, {
        method: "POST",
        body: JSON.stringify(correctedLanguage ? { correctedLanguage } : {}),
      }),
  });
}
