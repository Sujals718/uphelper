export interface WeaknessHeatmapEntry {
  tag: string;
  mistakeCount: number;
  unsolvedCount: number;
  total: number;
}

/**
 * Aggregates a user's mistakes and unsolved problems by tag — Phase 6's
 * weakness heatmap .
 *
 * Pure function, no I/O: takes plain arrays of tag-lists (one entry per
 * mistake / per unsolved problem) so it's unit-testable against fixture
 * data the same way `buildContestSummaries` and the SM-2 function are,
 * independent of Prisma or a live DB.
 *
 * Tags are de-duplicated WITHIN a single mistake/problem before counting
 * — a mistake tagged `["greedy", "greedy"]` (or a problem with a
 * duplicate tag from a messy source feed) should count once toward
 * "greedy", not twice. Deduping is intentionally per-row, not global:
 * two different mistakes both tagged "graphs" correctly count as 2.
 */
export function buildWeaknessHeatmap(
  mistakeTagSets: string[][],
  unsolvedTagSets: string[][],
): WeaknessHeatmapEntry[] {
  const counts = new Map<string, { mistakeCount: number; unsolvedCount: number }>();

  const bump = (tag: string, key: 'mistakeCount' | 'unsolvedCount') => {
    const normalized = tag.trim();
    if (!normalized) return; // an empty/whitespace-only tag carries no signal
    const entry = counts.get(normalized) ?? { mistakeCount: 0, unsolvedCount: 0 };
    entry[key] += 1;
    counts.set(normalized, entry);
  };

  for (const tags of mistakeTagSets) {
    for (const tag of new Set(tags)) bump(tag, 'mistakeCount');
  }
  for (const tags of unsolvedTagSets) {
    for (const tag of new Set(tags)) bump(tag, 'unsolvedCount');
  }

  return [...counts.entries()]
    .map(([tag, c]) => ({ tag, mistakeCount: c.mistakeCount, unsolvedCount: c.unsolvedCount, total: c.mistakeCount + c.unsolvedCount }))
    .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
}
