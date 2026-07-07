export interface QueryRelevanceContext {
  contestName: string;
  problemCode?: string;
  problemName?: string;
 
  platform?: string;
}

// Generic words that appear in nearly every CP-solution video title and
// therefore carry no discriminating power for "is this about THIS
// contest" — excluded from the problemName word-overlap check so a title
// like "Codeforces Solution" doesn't count as a match on "solution" alone.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'solution', 'solutions', 'problem', 'problems',
  'codeforces', 'round', 'div', 'division', 'contest', 'editorial', 'video',
]);

// Real-world regression: a search for "Codeforces Round 1094 ... 2222C" was matching
// "Leetcode Monthly Challenge | #1094 Car Pooling" purely because "1094"
// appeared in both — contest numbers alone are not sufficient because
// multiple platforms reuse similar/overlapping numbering. Any title that
// clearly identifies itself as belonging to one of these OTHER platforms
// is rejected outright, before any contest-number/letter logic runs,
// UNLESS the search itself is for that platform.
const FOREIGN_PLATFORM_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: 'leetcode', regex: /\bleet\s?code\b/i },
  { key: 'atcoder', regex: /\bat\s?coder\b/i },
  { key: 'codechef', regex: /\bcode\s?chef\b/i },
  { key: 'cses', regex: /\bcses\b/i },
  { key: 'hackerrank', regex: /\bhacker\s?rank\b/i },
  { key: 'hackerearth', regex: /\bhacker\s?earth\b/i },
  { key: 'spoj', regex: /\bspoj\b/i },
  { key: 'kickstart', regex: /\bkick\s?start\b/i },
  { key: 'icpc', regex: /\bicpc\b/i },
  { key: 'adventofcode', regex: /\badvent\s?of\s?code\b/i },
];

function normalizePlatformKey(platform: string): string {
  return platform.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Returns true if the title clearly identifies itself as belonging to a
 * DIFFERENT platform than the one being searched. Deliberately checked
 * before anything else in matchesSearchQuery — a shared contest number or
 * problem letter is not enough to override an explicit "this is LeetCode
 * / AtCoder / ..." signal in the title (that was exactly the bug: a
 * contest-number match was letting cross-platform videos through).
 *
 * Mixed-platform titles (e.g. "AtCoder ... + Codeforces Round 1101 ...
 * Post Contest Discussion") are also rejected rather than special-cased —
 * per the project's explicit "a false positive is worse than a false
 * negative" preference, an ambiguous multi-platform title is safer to
 * drop than to keep.
 */
export function mentionsForeignPlatform(title: string, platform: string): boolean {
  const ours = normalizePlatformKey(platform || 'codeforces');
  return FOREIGN_PLATFORM_PATTERNS.some((p) => p.key !== ours && p.regex.test(title));
}

function extractContestNumber(contestName: string): string | null {
  // Codeforces round names are consistently "... Round <number>[ (Div. N)]"
  // — the round number is by far the most discriminating token available
  // (unlike "Codeforces"/"Round", which are in almost every title in this
  // niche and therefore useless as a filter on their own).
  const match = contestName.match(/\d{3,4}/);
  return match ? match[0] : null;
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A CF problem "code" is the trailing letter, optionally followed by a
 * sub-index digit for divided easy/hard problems: "A", "1863A", "C1",
 * "D2", "2232C2". This pulls out BOTH parts — the base letter (used for
 * bundle/range matching, which never cares about easy/hard) and the
 * variant digit if one is explicitly present (used for single-problem
 * matching, which must NOT treat C1 and C2 as equivalent — see project
 * notes "Some more issues fix.txt", Issue 1).
 *
 * `variant` is `undefined` (not '0' or '') whenever the code doesn't
 * state a sub-index at all — that's the "ambiguous, can't compare"
 * case, distinct from "explicitly stated and different."
 */
function parseProblemCode(code: string): { letter: string | null; variant?: string } {
  const match = code.match(/([A-Za-z])(\d*)\s*$/);
  if (!match) return { letter: null };
  return { letter: match[1].toUpperCase(), variant: match[2] || undefined };
}

type LetterSignalType = 'none' | 'single' | 'range' | 'list';

interface LetterSignal {
  type: LetterSignalType;
  letters: string[];
  /** Only meaningful for type 'single' — explicit sub-index digit ('1'/'2'/...), if the title states one. */
  variant?: string;
}

function detectVersionPhraseVariant(title: string): string | undefined {
  // "Easy Version"/"Hard Version" is the other extremely common way a
  // dedicated single-problem video states which divided-round variant it
  // covers, without necessarily spelling out "C1"/"C2" anywhere. CF's own
  // convention is variant 1 = Easy, variant 2 = Hard.
  if (/\beasy\s*version\b/i.test(title)) return '1';
  if (/\bhard\s*version\b/i.test(title)) return '2';
  return undefined;
}

/**
 * Reads a title's own letter signal — a "A to D" or "A-D" range, an "A,
 * B, C, D" style list, or a single-problem claim (a global code like
 * "2232C2", a bare "C1"/"C2" token, a "Problem C"/"C." lead, or — as a
 * last resort — the one bare single-letter token in an otherwise
 * unclassified title). Returns `'none'` for anything ambiguous, which the
 * caller treats as "include — can't rule it out" rather than excluding by
 * default.
 *
 * The bare-single-letter-token fallback deliberately excludes "I" and "A"
 * — the pronoun and the indefinite article are common enough in ordinary
 * English titles ("I finally got AC!", "A Day in My Life") that treating
 * them as a problem-letter claim would trade one false-positive bug for
 * a false-negative one. Every other bare letter is far less likely to
 * appear in a title for any reason other than naming a problem.
 */
function parseLetterSignal(title: string): LetterSignal {
  // Strip language names that would otherwise read as a bare letter token.
  // NOTE: the trailing boundary must be a negative lookahead, not `\b` —
  // `\b` only fires between a word char and a non-word char, and both
  // "+"/"#" are non-word, so `\bc\+\+\b`/`\bc#\b` never actually matched
  // "C++"/"C#" when followed by whitespace, punctuation, or end-of-string
  // (the normal case in a title) — this stripping step was silently a
  // no-op before this fix.
  const cleaned = title.replace(/\bc\+\+(?!\w)/gi, '').replace(/\bc#(?!\w)/gi, '');

  const rangeMatch = cleaned.match(/\b([A-Za-z])\s*(?:to|-|–|—)\s*([A-Za-z])\b/i);
  if (rangeMatch) {
    const start = rangeMatch[1].toUpperCase().charCodeAt(0);
    const end = rangeMatch[2].toUpperCase().charCodeAt(0);
    if (end > start && end - start <= 12) {
      const letters: string[] = [];
      for (let c = start; c <= end; c++) letters.push(String.fromCharCode(c));
      return { type: 'range', letters };
    }
  }

  // "A, B, C, D Solutions" / "A B C D" — 3+ distinct single-letter tokens
  // separated by commas/spaces strongly suggests a bundle.
  const tokens = cleaned.match(/\b[A-Za-z]\b/g) ?? [];
  const distinct = Array.from(new Set(tokens.map((t) => t.toUpperCase())));
  if (distinct.length >= 3) {
    return { type: 'list', letters: distinct };
  }

  // A CF global problem code with NO separator between the digits and the
  // letter — "2238C", "1863D2" — is by far the most common way these
  // titles actually identify which problem they cover. Captures the
  // trailing sub-index digit (if any) as the explicit variant — this is
  // the "never strip the numeric suffix" fix: "2232C2" must be read as
  // C-variant-2, not just "C".
  const codeMatch = cleaned.match(/\b\d{3,4}([A-Za-z])(\d*)\b/);
  if (codeMatch) {
    return { type: 'single', letters: [codeMatch[1].toUpperCase()], variant: codeMatch[2] || undefined };
  }

  // A standalone "C1"/"C2"/"F1" style token with no contest-number prefix
  // right next to it — the other extremely common way a dedicated
  // easy/hard-variant video leads its own title (e.g. "C1 Seating
  // Arrangement (Easy Version)"). Bounded to a single letter + a single
  // digit so it doesn't fire on unrelated alphanumeric tokens.
  const bareVariantMatch = cleaned.match(/\b([A-Za-z])([1-9])\b/);
  if (bareVariantMatch) {
    return { type: 'single', letters: [bareVariantMatch[1].toUpperCase()], variant: bareVariantMatch[2] };
  }

  const singleMatch =
    cleaned.match(/\b(?:problem|prob|que(?:s(?:tion)?)?|qn)\.?\s*[:#-]?\s*([A-Za-z])\b/i) ??
    cleaned.match(/\b\d{3,4}\s*[-\s]\s*([A-Za-z])\b/) ??
    // The other extremely common convention: the title is simply LED with
    // the bare problem letter immediately followed by a period, no
    // "Problem"/"Prob" keyword at all — "C. Village Guilds", "A. Another
    // Popcount Problem", "B. AI Finds Nothing Here". Anchored to the very
    // start of the title, or right after a "|"/":"/"-" separator, so an
    // unrelated mid-sentence "X. Y" construction elsewhere in a title
    // doesn't false-positive.
    cleaned.match(/(?:^|[|:\-–—]\s*)([A-Za-z])\.\s/);
  if (singleMatch) {
    return {
      type: 'single',
      letters: [singleMatch[1].toUpperCase()],
      variant: detectVersionPhraseVariant(title),
    };
  }

  // Last resort: exactly one bare single-letter token anywhere in an
  // otherwise-unclassified title. Titles
  // like "Codeforces Round 1103 Div 3 D | ... | Full Intuition +
  // Solution" or "Codeforces Round 1103, B Solution" don't match any
  // pattern above, but clearly claim ONE specific problem — previously
  // these fell through to 'none' ("ambiguous, include") and leaked wrong-
  // problem videos into a different problem's results. "I" and "A" are
  // excluded (see function doc) since they're common English words, not
  // problem-letter claims, in the overwhelming majority of real titles.
  if (distinct.length === 1 && distinct[0] !== 'I' && distinct[0] !== 'A') {
    return { type: 'single', letters: distinct, variant: detectVersionPhraseVariant(title) };
  }

  return { type: 'none', letters: [] };
}

/**
 * Given a contest-level title match (the contest number is already
 * confirmed present), decides whether it's consistent with covering the
 * target problem code. A bundle/livestream that only names the contest
 * — no letter signal at all — is included (it's ambiguous, likely a
 * full-round video, which is exactly the coverage the build spec calls
 * "where most of the coverage for any individual problem actually
 * lives"). A title that clearly claims ONE specific, DIFFERENT problem
 * (wrong letter, OR the right letter but an explicitly conflicting
 * easy/hard variant), or a range/list that plainly excludes our letter,
 * is rejected.
 *
 * Range/list (bundle) signals are compared using the BASE LETTER ONLY —
 * a bundle naturally covers both C1 and C2 if it covers "C" at all, since
 * it's discussing the contest rather than one exact variant. Single-
 * problem signals are compared using the FULL code (letter + variant) —
 * a dedicated C1 video must never be accepted for a C2 search, and vice
 * versa. This split is deliberate.
 */
function isConsistentWithTargetCode(title: string, problemCode?: string): boolean {
  if (!problemCode) return true; // nothing to check the title against

  const target = parseProblemCode(problemCode);
  if (!target.letter) return true;

  const signal = parseLetterSignal(title);
  switch (signal.type) {
    case 'none':
      return true;
    case 'range':
    case 'list':
      return signal.letters.includes(target.letter);
    case 'single': {
      if (signal.letters[0] !== target.letter) return false;
      // Both sides explicitly state a variant and they disagree — reject.
      // If either side is silent on variant, there's nothing to safely
      // compare, so don't punish an ambiguous case we can't resolve.
      if (signal.variant && target.variant && signal.variant !== target.variant) {
        return false;
      }
      return true;
    }
  }
}

/**
 * Returns false for candidates that don't actually mention the searched
 * contest/problem anywhere in their title — e.g. an unrelated streamer's
 * recurring "Competitive Programming Live #47" show that YouTube's fuzzy
 * relevance search surfaced for a query it only loosely overlaps with —
 * or that clearly belong to a different platform, or that clearly claim
 * one specific, different problem (wrong letter, or the right letter but
 * a conflicting easy/hard variant). Applied to every candidate BEFORE
 * it's counted toward "the primary query returned results" or shown to a
 * user.
 *
 * Deliberately fails OPEN (returns true) when there's no real signal to
 * check against at all — e.g. a contest name with no extractable round
 * number and a problem name with no words long enough to be meaningful —
 * rather than silently discarding every result in that edge case. This
 * is a quality filter on top of YouTube's own relevance ranking, not a
 * replacement for it.
 *
 * Pure function — no I/O — independently unit-testable.
 */
export function matchesSearchQuery(title: string, ctx: QueryRelevanceContext): boolean {
  // Cross-platform contamination check runs FIRST and overrides everything
  // else — a shared contest number or problem letter must never outrank
  // an explicit "this is actually LeetCode/AtCoder/..." signal in the
  // title
  if (mentionsForeignPlatform(title, ctx.platform ?? 'codeforces')) {
    return false;
  }

  const t = title.toLowerCase();
  const contestNumber = extractContestNumber(ctx.contestName);

  if (contestNumber && t.includes(contestNumber)) {
    return isConsistentWithTargetCode(title, ctx.problemCode);
  }

  if (ctx.problemCode && ctx.problemCode.length >= 2) {
    // Whole-word/boundary match only — a bare single-letter code like "A"
    // is excluded above this length check specifically because it would
    // match almost any title and provide no real signal on its own; the
    // contest-number check above is what should catch those cases.
    const re = new RegExp(`\\b${escapeRegExp(ctx.problemCode.toLowerCase())}\\b`);
    if (re.test(t)) return true;
  }

  if (ctx.problemName) {
    const words = significantWords(ctx.problemName);
    if (words.length > 0) {
      return words.some((w) => t.includes(w));
    }
  }

  // Nothing meaningful to check against at all — don't fail closed here.
  // Must check ctx.problemCode too, not just contestNumber/problemName:
  // a single-letter code like "A" is too weak to MATCH on by itself (the
  // check above skips it), but its mere presence still means the caller
  // DOES have real query context to fail against — it just didn't match.
  // Treating "problemCode present but unusable" the same as "no
  // problemCode at all" was the bug: it let a bare "A" silently fall
  // through to "nothing to check" and match every title.
  return (
    !contestNumber &&
    !ctx.problemCode &&
    (!ctx.problemName || significantWords(ctx.problemName).length === 0)
  );
}
