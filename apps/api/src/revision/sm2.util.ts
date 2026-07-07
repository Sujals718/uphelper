/**
 * SM-2 spaced repetition, as a pure function — no Prisma, no HTTP, no
 * implicit wall-clock dependency (the caller passes `now`, defaulted for
 * convenience). Same pattern as `buildContestSummaries`: this is
 * the piece that gets unit-tested against known input/output pairs,
 * independent of whether a database is reachable.
 *
 * Reference: Piotr Wozniak's original SuperMemo-2 algorithm.
 * https://super-memory.com/english/ol/sm2.htm
 *
 * ASSUMPTION (documented, not silently baked in — the build spec says
 * "user's recall grade" without pinning a scale): grade uses the classic
 * SM-2 0-5 quality-of-recall scale, not a simplified Anki-style 0-3 scale:
 *   0 = complete blackout            3 = correct, but serious difficulty
 *   1 = wrong, but the answer felt   4 = correct, after some hesitation
 *       familiar once seen
 *   2 = wrong, but easy to recall    5 = perfect, effortless recall
 *       once seen
 * Any grade below 3 counts as a failed recall and resets the streak.
 */

export interface Sm2State {
  repetition: number;
  easeFactor: number;
  intervalDays: number;
}

export interface Sm2Result extends Sm2State {
  nextReviewAt: Date;
}

export function calculateSm2(state: Sm2State, grade: number, now: Date = new Date()): Sm2Result {
  if (!Number.isInteger(grade) || grade < 0 || grade > 5) {
    throw new Error('grade must be an integer between 0 and 5');
  }

  let repetition: number;
  let intervalDays: number;

  if (grade < 3) {
    // Failed recall: back to day 1 on the schedule. The ease-factor
    // formula below still applies on a failure (it just pulls EF down
    // harder for lower grades) — failing after a long streak costs more
    // than failing on attempt one, which is the intended SM-2 behavior.
    repetition = 0;
    intervalDays = 1;
  } else {
    repetition = state.repetition + 1;
    if (repetition === 1) {
      intervalDays = 1;
    } else if (repetition === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(state.intervalDays * state.easeFactor);
    }
  }

  // Standard SM-2 ease-factor update. Floored at 1.3 — SuperMemo's own
  // floor — so a run of bad grades can't push the multiplier to zero (or
  // negative) and start shrinking intervals instead of just slowing their
  // growth. No upper cap: a long streak of grade-5 reviews is allowed to
  // keep raising the ease factor, per the original algorithm.
  let easeFactor = state.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;
  easeFactor = Math.round(easeFactor * 100) / 100;

  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return { repetition, easeFactor, intervalDays, nextReviewAt };
}
