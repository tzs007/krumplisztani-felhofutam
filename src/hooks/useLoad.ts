import { useEffect, useLayoutEffect, useRef, type DependencyList } from 'react';

/**
 * Starts `load` when the screen opens and whenever `deps` change, and hands
 * its result to `onResult` — unless the deps changed again or the screen
 * closed meanwhile. `load` may return null: nothing to load.
 */
export function useLoad<T>(load: () => Promise<T> | null, onResult: (value: T) => void, deps: DependencyList) {
  const onResultRef = useRef(onResult);
  useLayoutEffect(() => {
    onResultRef.current = onResult;
  });
  useEffect(() => {
    const pending = load();
    if (!pending) return;
    let alive = true;
    pending.then((value) => {
      if (alive) onResultRef.current(value);
    });
    return () => {
      alive = false;
    };
    // the caller lists what `load` depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
