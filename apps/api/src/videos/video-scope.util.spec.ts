import { inferVideoScope, parseIso8601DurationToMinutes, scopeNoteFor } from './video-scope.util';

describe('inferVideoScope', () => {
  it('detects a letter-range bundle title', () => {
    expect(inferVideoScope({ title: 'Codeforces Round 1002 A to D Solutions' })).toBe('multi_problem_bundle');
    expect(inferVideoScope({ title: 'CF Round 999 A-D Editorial' })).toBe('multi_problem_bundle');
  });

  it('detects 3+ distinct letter tokens as a bundle', () => {
    expect(inferVideoScope({ title: 'A B C D solutions walkthrough' })).toBe('multi_problem_bundle');
  });

  it('detects explicit bundle language', () => {
    expect(inferVideoScope({ title: 'Full Contest Editorial for Round 1002' })).toBe('multi_problem_bundle');
  });

  it('detects a single CF-style problem code as single_problem', () => {
    expect(inferVideoScope({ title: '1002A Two Arrays - Solution Explained' })).toBe('single_problem');
  });

  it('defaults to unknown when no pattern matches and duration is unknown', () => {
    expect(inferVideoScope({ title: 'How I got Grandmaster on Codeforces' })).toBe('unknown');
  });

  it('does not false-positive on a divided-round code like A2', () => {
    expect(inferVideoScope({ title: '1002A2 Two Arrays (Hard Version)' })).not.toBe('multi_problem_bundle');
  });

  it('flags a long livestream VOD as a bundle even with a generic title', () => {
    // This is the case a title-only heuristic misses entirely — a
    // recurring show name with no letter/editorial pattern at all.
    expect(
      inferVideoScope({ title: 'Competitive Programming Live #47', durationMinutes: 130 }),
    ).toBe('multi_problem_bundle');
  });

  it('does not treat a short video with a generic title as a bundle', () => {
    expect(
      inferVideoScope({ title: 'Competitive Programming Tips', durationMinutes: 12 }),
    ).not.toBe('multi_problem_bundle');
  });

  it('duration signal overrides an absent title pattern regardless of order checked', () => {
    expect(inferVideoScope({ title: 'Two Arrays', durationMinutes: 90 })).toBe('multi_problem_bundle');
  });

  it('does not let a trailing "C++" language tag count as a second letter token (regression)', () => {
    // The C++/C# stripping regex previously used `\bc\+\+\b`, which can
    // never match — `\b` requires a word/non-word transition, and both
    // "+" characters are non-word, so there's no boundary between the
    // final "+" and a following space or end-of-string. That silently
    // left "C++" unstripped, so a genuinely single-problem title like
    // this one counted TWO letter-C tokens (the real "C." problem letter,
    // plus "C" from "C++") against the single_problem check's `<= 1`
    // condition and fell through to 'unknown' instead.
    expect(
      inferVideoScope({ title: 'Codeforces Round 1106 (Div. 2) || C. Village Guilds || 2238C || C++' }),
    ).toBe('single_problem');
  });
});

describe('parseIso8601DurationToMinutes', () => {
  it('parses hours, minutes, and seconds', () => {
    expect(parseIso8601DurationToMinutes('PT1H32M10S')).toBeCloseTo(92.17, 1);
  });

  it('parses minutes-only durations', () => {
    expect(parseIso8601DurationToMinutes('PT8M30S')).toBeCloseTo(8.5, 1);
  });

  it('returns undefined for missing or malformed input', () => {
    expect(parseIso8601DurationToMinutes(undefined)).toBeUndefined();
    expect(parseIso8601DurationToMinutes('not-a-duration')).toBeUndefined();
  });
});

describe('scopeNoteFor', () => {
  it('returns a livestream-specific note for long bundle videos', () => {
    const note = scopeNoteFor('multi_problem_bundle', 130);
    expect(note).toMatch(/livestream/);
    expect(note).toMatch(/chat/);
  });

  it('returns the generic bundle note when duration is unknown or short', () => {
    expect(scopeNoteFor('multi_problem_bundle')).toMatch(/whole video/);
    expect(scopeNoteFor('multi_problem_bundle', 20)).toMatch(/whole video/);
  });

  it('returns null for single_problem and unknown', () => {
    expect(scopeNoteFor('single_problem')).toBeNull();
    expect(scopeNoteFor('unknown')).toBeNull();
  });
});
