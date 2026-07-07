import { calculateSm2 } from './sm2.util';

describe('calculateSm2', () => {
  const NOW = new Date('2026-07-04T12:00:00.000Z');

  it('rejects grades outside 0-5 or non-integer grades', () => {
    const state = { repetition: 0, easeFactor: 2.5, intervalDays: 1 };
    expect(() => calculateSm2(state, 6, NOW)).toThrow();
    expect(() => calculateSm2(state, -1, NOW)).toThrow();
    expect(() => calculateSm2(state, 2.5, NOW)).toThrow();
  });

  it('first-ever perfect review: interval stays 1 day, ease factor rises by 0.1', () => {
    const result = calculateSm2({ repetition: 0, easeFactor: 2.5, intervalDays: 1 }, 5, NOW);

    expect(result.repetition).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(2.6);
    expect(result.nextReviewAt.toISOString().slice(0, 10)).toBe('2026-07-05');
  });

  it('second consecutive perfect review: interval jumps to the SM-2 fixed 6-day step', () => {
    const result = calculateSm2({ repetition: 1, easeFactor: 2.6, intervalDays: 1 }, 5, NOW);

    expect(result.repetition).toBe(2);
    expect(result.intervalDays).toBe(6);
    expect(result.easeFactor).toBe(2.7);
    expect(result.nextReviewAt.toISOString().slice(0, 10)).toBe('2026-07-10');
  });

  it('third consecutive perfect review: interval now grows by the ease-factor multiplier', () => {
    const result = calculateSm2({ repetition: 2, easeFactor: 2.7, intervalDays: 6 }, 5, NOW);

    expect(result.repetition).toBe(3);
    expect(result.intervalDays).toBe(16); // round(6 * 2.7) = round(16.2) = 16
    expect(result.easeFactor).toBe(2.8);
    expect(result.nextReviewAt.toISOString().slice(0, 10)).toBe('2026-07-20');
  });

  it('failed recall resets repetition and interval to 1, regardless of the prior streak', () => {
    const result = calculateSm2({ repetition: 3, easeFactor: 2.8, intervalDays: 16 }, 2, NOW);

    expect(result.repetition).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(2.48);
    expect(result.nextReviewAt.toISOString().slice(0, 10)).toBe('2026-07-05');
  });

  it('ease factor never drops below the SM-2 floor of 1.3, even on a bad grade', () => {
    const result = calculateSm2({ repetition: 2, easeFactor: 1.35, intervalDays: 6 }, 0, NOW);

    expect(result.easeFactor).toBe(1.3);
    expect(result.repetition).toBe(0);
    expect(result.intervalDays).toBe(1);
  });
});
