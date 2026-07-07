"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  FilledPromptResponse,
  GetDebugPromptRequest,
  GetHintPromptRequest,
} from "@uphelper/shared-types";
import { apiFetch } from "../api-client";

// Both prompt endpoints are on-demand (hit "Generate prompt"), so these
// are useMutation wrappers, same reasoning as useSearchVideos() —
// nothing here is data you'd want refetching in the background.
export function useGetHintPrompt() {
  return useMutation({
    mutationFn: (req: GetHintPromptRequest) => {
      const params = new URLSearchParams({
        problemName: req.problemName,
        platform: req.platform,
        contestName: req.contestName,
      });
      if (req.problemStatement) params.set("problemStatement", req.problemStatement);
      return apiFetch<FilledPromptResponse>(`/prompts/hint?${params.toString()}`);
    },
  });
}

export function useGetDebugPrompt() {
  return useMutation({
    mutationFn: (req: GetDebugPromptRequest) =>
      apiFetch<FilledPromptResponse>("/prompts/debug", {
        method: "POST",
        body: JSON.stringify(req),
      }),
  });
}
