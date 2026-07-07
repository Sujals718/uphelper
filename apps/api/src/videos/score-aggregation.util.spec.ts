import {
  computeFinalScore,
  MIN_COMMENTS_FOR_SENTIMENT_WEIGHT,
  NO_SENTIMENT_POPULARITY_MULTIPLIER,
} from './score-aggregation.util';

describe('computeFinalScore', () => {
  it('never returns null — a video with no sentiment data still gets a ranked, popularity-only score', () => {
    const result = computeFinalScore({
      satisfactionScore: null,
      sampledCommentCount: 0,
      viewCount: 50_000,
      likeCount: 1_000,
    });
    expect(result.finalScore).not.toBeNull();
    expect(result.finalScore).toBeGreaterThan(0);
    expect(result.sentimentApplied).toBe(false);
  });

  it('penalizes the no-sentiment fallback relative to the same video WITH a trusted sentiment score', () => {
    const noComments = computeFinalScore({
      satisfactionScore: null,
      sampledCommentCount: 0,
      viewCount: 50_000,
      likeCount: 1_000,
    });
    const withGoodSentiment = computeFinalScore({
      satisfactionScore: 80,
      sampledCommentCount: 50,
      viewCount: 50_000,
      likeCount: 1_000,
    });
    expect(noComments.finalScore).toBeLessThan(withGoodSentiment.finalScore);
    // Exactly the documented penalty multiplier against the same popularity base.
    expect(noComments.finalScore).toBeCloseTo(NO_SENTIMENT_POPULARITY_MULTIPLIER * noComments.popularityScore, 2);
  });

  it('treats a too-thin comment sample (below the trust threshold) the same as no sentiment at all', () => {
    const thin = computeFinalScore({
      satisfactionScore: 95, // even a very high score shouldn't be trusted off 2 comments
      sampledCommentCount: MIN_COMMENTS_FOR_SENTIMENT_WEIGHT - 1,
      viewCount: 10_000,
      likeCount: 200,
    });
    expect(thin.sentimentApplied).toBe(false);
    expect(thin.finalScore).toBeCloseTo(NO_SENTIMENT_POPULARITY_MULTIPLIER * thin.popularityScore, 2);
  });

  it('applies the sentiment component once the comment sample meets the trust threshold', () => {
    const result = computeFinalScore({
      satisfactionScore: 95,
      sampledCommentCount: MIN_COMMENTS_FOR_SENTIMENT_WEIGHT,
      viewCount: 10_000,
      likeCount: 200,
    });
    expect(result.sentimentApplied).toBe(true);
  });

  it('weights sentiment far more heavily than popularity once trusted', () => {
    const highSentimentLowViews = computeFinalScore({
      satisfactionScore: 90,
      sampledCommentCount: 50,
      viewCount: 100,
      likeCount: 5,
    });
    const lowSentimentHighViews = computeFinalScore({
      satisfactionScore: 10,
      sampledCommentCount: 50,
      viewCount: 5_000_000,
      likeCount: 200_000,
    });
    expect(highSentimentLowViews.finalScore).toBeGreaterThan(lowSentimentHighViews.finalScore);
  });

  it('caps the popularity component so raw views/likes cannot dominate', () => {
    const oneMillion = computeFinalScore({
      satisfactionScore: 50,
      sampledCommentCount: 50,
      viewCount: 1_000_000,
      likeCount: 100_000,
    });
    const tenMillion = computeFinalScore({
      satisfactionScore: 50,
      sampledCommentCount: 50,
      viewCount: 10_000_000,
      likeCount: 1_000_000,
    });
    expect(Math.abs(oneMillion.finalScore - tenMillion.finalScore)).toBeLessThan(5);
  });

  it('returns 0 popularity for a video with zero views and zero likes', () => {
    const result = computeFinalScore({
      satisfactionScore: 50,
      sampledCommentCount: 50,
      viewCount: 0,
      likeCount: 0,
    });
    expect(result.popularityScore).toBe(0);
  });
});
