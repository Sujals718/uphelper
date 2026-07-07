import { createConcurrencyLimiter } from './concurrency-limit.util';

describe('createConcurrencyLimiter', () => {
  it('never runs more than `limit` tasks at once', async () => {
    const limit = createConcurrencyLimiter(2);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return active;
      });

    await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('still runs every queued task exactly once, in order of completion resolving correctly', async () => {
    const limit = createConcurrencyLimiter(1);
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map((n) =>
        limit(async () => {
          order.push(n);
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3]);
  });

  it('propagates a rejected task without blocking the queue', async () => {
    const limit = createConcurrencyLimiter(1);
    const results: Array<'ok' | 'err'> = [];

    await Promise.allSettled([
      limit(async () => {
        throw new Error('boom');
      }).then(
        () => results.push('ok'),
        () => results.push('err'),
      ),
      limit(async () => {
        results.push('ok');
      }),
    ]);

    expect(results).toEqual(['err', 'ok']);
  });

  it('rejects construction with an invalid limit', () => {
    expect(() => createConcurrencyLimiter(0)).toThrow();
  });
});
