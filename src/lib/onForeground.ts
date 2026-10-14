import { AppState } from 'react-native';

/** Calls `fn` whenever the app comes back to the foreground. */
export function onForeground(fn: () => unknown) {
  return AppState.addEventListener('change', (state) => {
    if (state === 'active') fn();
  });
}
