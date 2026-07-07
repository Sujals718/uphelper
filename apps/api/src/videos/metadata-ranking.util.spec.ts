import { metadataOnlyRankScore, selectTopCandidatesByMetadata, MetadataRankInput } from './metadata-ranking.util';

function make(overrides: Partial<MetadataRankInput> & { id: string }): MetadataRankInput {
  return {
    viewCount: 0,
    likeCount: 0,
    publishedAt: null,
    durationMinutes: null,
    videoScope: 'unknown',
    ...overrides,
  };
}

describe('metadataOnlyRankScore', () => {
  it('ranks a higher-view video above a lower-view one', () => {
    const popular = make({ id: 'a', viewCount: 100_000, likeCount: 2_000 });
    const obscure = make({ id: 'b', viewCount: 100, likeCount: 2 });
    expect(metadataOnlyRankScore(popular)).toBeGreaterThan(metadataOnlyRankScore(obscure));
  });

  it('gives a single_problem video a bonus over an equally popular bundle', () => {
    const single = make({ id: 'a', viewCount: 5_000, likeCount: 100, videoScope: 'single_problem' });
    const bundle = make({ id: 'b', viewCount: 5_000, likeCount: 100, videoScope: 'multi_problem_bundle' });
    expect(metadataOnlyRankScore(single)).toBeGreaterThan(metadataOnlyRankScore(bundle));
  });

  it('never lets the recency/scope bonuses invert a large popularity gap', () => {
    const hugelyPopularOldBundle = make({
      id: 'a',
      viewCount: 5_000_000,
      likeCount: 100_000,
      videoScope: 'multi_problem_bundle',
      publishedAt: new Date('2015-01-01'),
    });
    const tinyNewSingle = make({
      id: 'b',
      viewCount: 5,
      likeCount: 0,
      videoScope: 'single_problem',
      publishedAt: new Date(),
    });
    expect(metadataOnlyRankScore(hugelyPopularOldBundle)).toBeGreaterThan(metadataOnlyRankScore(tinyNewSingle));
  });
});

describe('selectTopCandidatesByMetadata', () => {
  it('returns only the top N by metadata rank score', () => {
    const candidates = [
      make({ id: 'low', viewCount: 10 }),
      make({ id: 'high', viewCount: 100_000 }),
      make({ id: 'mid', viewCount: 1_000 }),
    ];
    const top2 = selectTopCandidatesByMetadata(candidates, 2);
    expect(top2.map((c) => c.id)).toEqual(['high', 'mid']);
  });

  it('does not mutate the input array', () => {
    const candidates = [make({ id: 'a', viewCount: 1 }), make({ id: 'b', viewCount: 2 })];
    const original = [...candidates];
    selectTopCandidatesByMetadata(candidates, 1);
    expect(candidates).toEqual(original);
  });
});
