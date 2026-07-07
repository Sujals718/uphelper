// Minimal in-process concurrency limiter (a tiny hand-rolled version of
// what a library like `p-limit` gives you). Written by hand instead of
// pulling in a dependency because the need here is small and fixed: bound
// how many transcript-fetch calls or Gemini calls are in flight AT ONCE,
// app-wide, regardless of how many different callers (different users'
// searches, different videos in the same search) ask for one concurrently.
//
// Usage: create ONE limiter per resource at module scope (not per-request),
// and route every call to that resource through it:
//
//   const transcriptLimit = createConcurrencyLimiter(3);
//   const result = await transcriptLimit(() => fetchTranscript(id));
//
// If 10 callers call this within the same tick, only 3 run at once; the
// rest queue in FIFO order and start as slots free up.
export type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  if (limit < 1) {
    throw new Error(`createConcurrencyLimiter: limit must be >= 1, got ${limit}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (active >= limit) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job();
  };

  return function limited<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            runNext();
          });
      });
      runNext();
    });
  };
}
