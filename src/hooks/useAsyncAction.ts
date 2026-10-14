import { useState } from 'react';

import type { ActionError } from '@/lib/auth';

/**
 * A form action (save, sign in…) that resolves with null or a message for
 * the player: `busy` while it runs, then its `error`. `run` passes the result on.
 */
export function useAsyncAction<A extends unknown[]>(action: (...args: A) => Promise<ActionError>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionError>(null);
  const run = async (...args: A): Promise<ActionError> => {
    setBusy(true);
    const err = await action(...args);
    setBusy(false);
    setError(err);
    return err;
  };
  return { run, busy, error, setError };
}
