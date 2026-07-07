import { buildWeaknessHeatmap } from './weakness-heatmap.util';

describe('buildWeaknessHeatmap', () => {
  it('counts mistakes and unsolved problems separately per tag', () => {
    const result = buildWeaknessHeatmap(
      [['graphs', 'dp'], ['graphs']],
      [['dp'], ['greedy']],
    );

    // 'graphs' and 'dp' tie on total (2 each) — the alphabetical tiebreak
    // (see the "sorts by total descending, then alphabetically" case
    // below) puts 'dp' first. This ordering is intentional, not a
    // regression: the util's own sort is `total desc, then tag asc`.
    expect(result).toEqual([
      { tag: 'dp', mistakeCount: 1, unsolvedCount: 1, total: 2 },
      { tag: 'graphs', mistakeCount: 2, unsolvedCount: 0, total: 2 },
      { tag: 'greedy', mistakeCount: 0, unsolvedCount: 1, total: 1 },
    ]);
  });

  it('sorts by total descending, then alphabetically as a tiebreak', () => {
    const result = buildWeaknessHeatmap([['zebra'], ['apple']], []);
    expect(result.map((r) => r.tag)).toEqual(['apple', 'zebra']);
  });

  it('de-duplicates a tag repeated within one mistake/problem, but not across rows', () => {
    const result = buildWeaknessHeatmap([['greedy', 'greedy']], [['greedy']]);
    expect(result).toEqual([{ tag: 'greedy', mistakeCount: 1, unsolvedCount: 1, total: 2 }]);
  });

  it('ignores empty/whitespace-only tags', () => {
    const result = buildWeaknessHeatmap([['', '  ', 'dp']], []);
    expect(result).toEqual([{ tag: 'dp', mistakeCount: 1, unsolvedCount: 0, total: 1 }]);
  });

  it('returns an empty array when there is nothing to aggregate', () => {
    expect(buildWeaknessHeatmap([], [])).toEqual([]);
  });
});
