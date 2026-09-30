import { create } from 'zustand';

/**
 * - loading:  still starting up
 * - offline:  no backend / no network / sign-in failed → results stay on the device
 * - signedIn: a player account (an automatic anonymous one counts as a full player)
 */
export type AuthStatus = 'loading' | 'offline' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  userId: string | null;
  /** Generated "Csibe #1234" until the player renames it. */
  displayName: string | null;
  isAnonymous: boolean;
  /** Set once the account is saved with email + password. */
  email: string | null;
};

export const useAuthStore = create<AuthState>()(() => ({
  status: 'loading',
  userId: null,
  displayName: null,
  isAnonymous: false,
  email: null,
}));
