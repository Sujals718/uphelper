import type { VideoScope } from '@uphelper/shared-types';

// Contest rounds run 2 hours (Div 2/3) to 2.5 hours (Div 1) typically —
// past this, a video is far more likely to be a full-contest livestream
// VOD than a produced single-problem tutorial, regardless of what its
// title says. Livestream titles are often generic ("Codeforces Round 1002
// — Live!") and don't match any title pattern below at all, so duration
// is an independent signal, not a fallback for the same one.
const LIVESTREAM_LIKELY_DURATION_MINUTES = 45;

export interface VideoScopeInput {
  title: string;
  /** From videos.list's contentDetails.duration (ISO 8601), pre-parsed to minutes. Omit if unknown. */
  durationMinutes?: number;
}


export function inferVideoScope(input: VideoScopeInput): VideoScope {
  const t = input.title.trim();

  if (input.durationMinutes !== undefined && input.durationMinutes >= LIVESTREAM_LIKELY_DURATION_MINUTES) {
    return 'multi_problem_bundle';
  }

  // "A to D", "A to F", case-insensitive, letters only (CF problem
  // indices are occasionally "A1"/"B2" for divided rounds, but the plain
  // single-letter range is by far the common bundle-title pattern).
  if (/\b[A-Za-z]\s*(?:to|-|–|—)\s*[A-Za-z]\b/.test(t)) {
    return 'multi_problem_bundle';
  }

  const cleaned = t.replace(/\bc\+\+(?!\w)/gi, '').replace(/\bc#(?!\w)/gi, '');

  // "A, B, C, D Solutions" / "A B C D" — 3+ distinct single-letter tokens
  // separated by commas/spaces strongly suggests a bundle, whereas "A"
  // alone or "A2" (a single divided-round problem) should not match.
  const letterTokens = cleaned.match(/\b[A-Za-z]\b/g) ?? [];
  if (new Set(letterTokens.map((l) => l.toUpperCase())).size >= 3) {
    return 'multi_problem_bundle';
  }

  // Explicit bundle language regardless of letter pattern.
  if (/\b(all problems?|full contest|editorial(?:s)?|complete solutions?|live\b)\b/i.test(t)) {
    return 'multi_problem_bundle';
  }

  // A single CF-style problem code like "1002A" or a lone letter next to
  // "problem"/"solution" is a reasonably strong single-problem signal —
  // but absence of any signal at all should honestly default to
  // "unknown," not be forced into "single_problem."
  if (/\b\d{3,4}[A-Za-z]\b/.test(t) && letterTokens.length <= 1) {
    return 'single_problem';
  }

  return 'unknown';
}

/**
 * Parses YouTube's ISO 8601 duration format (e.g. "PT1H32M10S") to whole
 * minutes. Pure, defensive — returns undefined on anything unparseable
 * rather than throwing, since a malformed/missing contentDetails.duration
 * should degrade to "duration signal unavailable," not break scope
 * inference entirely.
 */
export function parseIso8601DurationToMinutes(duration: string | undefined): number | undefined {
  if (!duration) return undefined;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 60 + minutes + seconds / 60;
}


export function scopeNoteFor(scope: VideoScope, durationMinutes?: number): string | null {
  if (scope !== 'multi_problem_bundle') return null;

  if (durationMinutes !== undefined && durationMinutes >= LIVESTREAM_LIKELY_DURATION_MINUTES) {
    return `This looks like a full-contest livestream recording (~${Math.round(durationMinutes)} min) covering multiple problems — the satisfaction score reflects the whole stream, not this problem specifically, and comment volume tends to run lower than a produced video since live viewers mostly reacted in chat rather than the comment section.`;
  }

  return 'This video appears to cover multiple problems — the satisfaction score reflects the whole video, not this problem specifically.';
}

