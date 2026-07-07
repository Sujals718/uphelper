import { matchesSearchQuery } from './query-relevance.util';

describe('matchesSearchQuery', () => {
  const ctx = { contestName: 'Codeforces Round 1002', problemCode: 'A', problemName: 'Two Arrays' };

  it('matches on the contest round number alone (bundle/livestream titles)', () => {
    expect(matchesSearchQuery('Competitive Programming Live #47 — Round 1002', ctx)).toBe(true);
  });

  it('matches on a full external-id-style code like "1002A"', () => {
    expect(matchesSearchQuery('1002A Two Arrays - Solution Explained', ctx)).toBe(true);
  });

  it('matches on significant problem-name words even without the code', () => {
    expect(matchesSearchQuery('How to solve Two Arrays step by step', ctx)).toBe(true);
  });

  it('rejects an unrelated livestream that never mentions this round or problem', () => {
    expect(matchesSearchQuery('Competitive Programming Live #47', ctx)).toBe(false);
  });

  it('rejects a title that only shares a generic word with the problem name', () => {
    const genericCtx = { contestName: 'Codeforces Round 1002', problemCode: 'B', problemName: 'Solution' };
    // "Solution" is a stopword — excluded from the meaningful-word check
    // specifically so this kind of near-universal overlap doesn't count.
    expect(matchesSearchQuery('Random unrelated video about solutions', genericCtx)).toBe(false);
  });

  it('does not let a bare single-letter code match everything', () => {
    const singleLetterCtx = { contestName: 'Some Contest With No Number', problemCode: 'A', problemName: '' };
    expect(matchesSearchQuery('A Day in My Life', singleLetterCtx)).toBe(false);
  });

  it('fails open when there is no extractable signal at all', () => {
    const noSignalCtx = { contestName: 'Weekly Practice Session', problemCode: '', problemName: '' };
    expect(matchesSearchQuery('Literally anything', noSignalCtx)).toBe(true);
  });

  describe('letter-range/bundle coverage (contest-level matches)', () => {
    const dCtx = { contestName: 'Codeforces Round 1107', problemCode: 'D', problemName: 'Some Problem' };

    it('includes a bundle title whose range explicitly covers the target letter', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 (Div 3) A to F Solutions', dCtx)).toBe(true);
    });

    it('excludes a bundle title whose range explicitly excludes the target letter', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 (Div 3) A to C Solutions', dCtx)).toBe(false);
    });

    it('includes a bundle title whose letter list covers the target letter', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 A, B, C, D Editorial', dCtx)).toBe(true);
    });

    it('excludes a bundle title whose letter list excludes the target letter', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 A, B, C Editorial', dCtx)).toBe(false);
    });

    it('includes an ambiguous contest-only livestream with no letter signal at all', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 (Div 3) Live Solve', dCtx)).toBe(true);
    });

    it('rejects a title that clearly claims one different specific problem', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 Problem A Explained', dCtx)).toBe(false);
    });

    it('does not mistake "C++" for a claim about problem C', () => {
      const cCtx = { contestName: 'Codeforces Round 1107', problemCode: 'D', problemName: 'Some Problem' };
      expect(matchesSearchQuery('Codeforces Round 1107 (Div 3) All Solutions in C++', cCtx)).toBe(true);
    });

    it('does not mistake the pronoun "I" for a claim about problem I', () => {
      expect(matchesSearchQuery('Codeforces Round 1107 (Div 3) — I finally got AC!', dCtx)).toBe(true);
    });
  });

  // Regression cases from a real production report: a batch of
  // single-problem videos for OTHER problems in the same round were
  // leaking into a problem's results looking exactly as "relevant" as a
  // genuine bundle video, because parseLetterSignal() didn't recognize
  // either of the two most common real-world CF video title conventions
  // below. Both used to fall through to signal type 'none' ("ambiguous,
  // include") instead of 'single' ("claims one specific — and here,
  // different — problem, exclude").
  describe('real-world title conventions (regression coverage)', () => {
    const round1106D = {
      contestName: 'Codeforces Round 1106 (Div 2)',
      problemCode: '2238D',
      problemName: 'Storming Arasaka',
    };
    const round1106C = {
      contestName: 'Codeforces Round 1106 (Div 2)',
      problemCode: '2238C',
      problemName: 'Village Guilds',
    };

    it('rejects a contiguous "{globalCode}" single-problem title for the wrong letter', () => {
      expect(
        matchesSearchQuery('Codeforces Round 1106 (Div. 2) || C. Village Guilds || 2238C || C++', round1106D),
      ).toBe(false);
    });

    it('accepts that same contiguous-code title for its actual, matching letter', () => {
      expect(
        matchesSearchQuery('Codeforces Round 1106 (Div. 2) || C. Village Guilds || 2238C || C++', round1106C),
      ).toBe(true);
    });

    it('rejects a leading "{Letter}. {Name}" title (no "Problem" keyword) for the wrong letter, typo and all', () => {
      expect(
        matchesSearchQuery(
          'Codeforces Round 1106 (Div. 2) || Probelm B. Crimson Triples || 2238B || C++',
          round1106D,
        ),
      ).toBe(false);
    });

    it('still includes a genuinely ambiguous full-round bundle title with no letter claim at all', () => {
      expect(matchesSearchQuery('6th place in Codeforces Round 1106 (Div. 2)', round1106D)).toBe(true);
    });
  });

  // Regression cases from real-world testing ("Some more issues.txt" /
  // "Some more issues fix.txt") — three separate bugs, all in the
  // relevance filter.
  describe('easy/hard variant matching (Issue 1 — C1 vs C2)', () => {
    const c2 = { contestName: 'Codeforces Round 1101 (Div. 2)', problemCode: '2232C2', problemName: 'Seating Arrangement' };
    const c1 = { contestName: 'Codeforces Round 1101 (Div. 2)', problemCode: '2232C1', problemName: 'Seating Arrangement' };

    it('rejects a dedicated C1 (Easy Version) video when searching for C2', () => {
      expect(
        matchesSearchQuery(
          'Codeforces Round 1101 (Div. 2) | C1 Seating Arrangement (Easy Version) | Codeforces solution | DP',
          c2,
        ),
      ).toBe(false);
    });

    it('accepts that same C1 video when searching for C1', () => {
      expect(
        matchesSearchQuery(
          'Codeforces Round 1101 (Div. 2) | C1 Seating Arrangement (Easy Version) | Codeforces solution | DP',
          c1,
        ),
      ).toBe(true);
    });

    it('rejects a dedicated C2/Hard-Version video when searching for C1', () => {
      expect(matchesSearchQuery('Codeforces Round 1101 (Div. 2) 2232C2 Seating Arrangement (Hard Version)', c1)).toBe(
        false,
      );
    });

    it('still includes a contest-wide bundle video for either C1 or C2 (bundles use the base letter only)', () => {
      const bundleTitle = 'Codeforces Round 1101 (Div 2) | Video Solutions - A to D | by Vikas Soni | TLE Eliminators';
      expect(matchesSearchQuery(bundleTitle, c1)).toBe(true);
      expect(matchesSearchQuery(bundleTitle, c2)).toBe(true);
    });
  });

  describe('wrong single-problem-letter leakage (Issue 2)', () => {
    const targetC = { contestName: 'Codeforces Round 1103', problemCode: '2236C', problemName: 'Omsk Programmers' };

    it('rejects a dedicated Problem D video ("Div 3 D" convention) when searching for C', () => {
      expect(
        matchesSearchQuery('Codeforces Round 1103 Div 3 D | Brand New Tatar TV Show | Full Intuition + Solution', targetC),
      ).toBe(false);
    });

    it('rejects a dedicated Problem E video when searching for C', () => {
      expect(matchesSearchQuery('Codeforces Round 1103 Div 3 E - Friendly Gifts | Full Intuition + Solution', targetC)).toBe(
        false,
      );
    });

    it('rejects a trailing bare-letter convention ("Round 1103, B Solution") when searching for C', () => {
      expect(matchesSearchQuery('Codeforces Round 1103, B Solution', targetC)).toBe(false);
    });

    it('still includes genuine contest-wide bundle videos for the same search', () => {
      expect(
        matchesSearchQuery(
          'Greedy, DP, Game Theory and Centroid Decomposition in Codeforces Round 1103 | Video Editorial',
          targetC,
        ),
      ).toBe(true);
    });
  });

  describe('cross-platform contamination (Issue 3)', () => {
    const target = { contestName: 'Codeforces Round 1094', problemCode: '2222C', problemName: 'Median Partition' };

    it('rejects a LeetCode video that only coincidentally shares the contest number', () => {
      expect(matchesSearchQuery('Leetcode Monthly Challenge | #1094 Car Pooling', target)).toBe(false);
      expect(matchesSearchQuery('2022-01-06 LeetCode 1094 & 427', target)).toBe(false);
    });

    it('rejects a mixed AtCoder+Codeforces discussion video even though it names our contest too', () => {
      expect(
        matchesSearchQuery('Atcoder Beginner Contest 460 + Codeforces Round 1101(DIV 2) | Post Contest Discussion', {
          contestName: 'Codeforces Round 1101 (Div. 2)',
          problemCode: '2232C2',
          problemName: 'Seating Arrangement',
        }),
      ).toBe(false);
    });

    it('still accepts a genuine Codeforces video for the same search', () => {
      expect(
        matchesSearchQuery('Codeforces Round 1094 (Div 1 + 2) | Video Solutions - A to D | by Vibhaas | TLE Eliminators', target),
      ).toBe(true);
    });
  });
});
