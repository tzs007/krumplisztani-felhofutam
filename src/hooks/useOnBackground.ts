import { useEffect, useLayoutEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Calls `fn` whenever the app leaves the foreground while this screen is open. */
export function useOnBackground(fn: () => void) {
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') fnRef.current();
    });
    return () => sub.remove();
  }, []);
}
