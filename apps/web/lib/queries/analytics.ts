"use client";

import { useQuery } from "@tanstack/react-query";
import type { WeaknessHeatmapEntry } from "@uphelper/shared-types";
import { apiFetch } from "../api-client";

export function useWeaknessHeatmap() {
  return useQuery({
    queryKey: ["analytics", "weakness-heatmap"],
    queryFn: () => apiFetch<WeaknessHeatmapEntry[]>("/analytics/weakness-heatmap"),
  });
}