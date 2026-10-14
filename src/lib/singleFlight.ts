/**
 * Wraps an async job so overlapping calls share one run: a call while it is
 * running gets the same promise; the next call after it settles starts a new run.
 */
export function singleFlight<A extends unknown[], T>(job: (...args: A) => Promise<T>) {
  let running: Promise<T> | null = null;
  const run = (...args: A): Promise<T> => {
    running ??= job(...args).finally(() => {
      running = null;
    });
    return running;
  };
  return Object.assign(run, { isRunning: () => running !== null });
}
