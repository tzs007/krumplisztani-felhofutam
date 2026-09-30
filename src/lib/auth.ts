/**
 * Player accounts. Every player gets an account automatically: on the first
 * launch the app signs in anonymously (Supabase anonymous sign-in), and the
 * database names the player "Csibe #1234". Email / Google come later and are
 * linked to this same account, so nothing is lost.
 *
 * Nothing here ever blocks the game: without backend, network or when the
 * sign-in fails, the status is "offline" and results stay on the device.
 */
import { useAuthStore } from '@/store/useAuthStore';

import { getSupabase } from './supabase';
import { withTimeout } from './withTimeout';

let listening = false;
let inFlight: Promise<AuthResult> | null = null;
let lastAttemptAt = -Infinity;

type AuthResult = 'offline' | 'signedIn';

/** A failed sign-in is retried by ensureSignedIn at most this often. */
export const RETRY_INTERVAL_MS = 15_000;

async function loadProfile(userId: string, isAnonymous: boolean) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  useAuthStore.setState({ status: 'signedIn', userId, isAnonymous, displayName: data?.display_name ?? null });
}

/** Restores the session or signs in anonymously; resolves with the resulting status. Never throws. */
export function initAuth({ timeoutMs = 4000 } = {}): Promise<AuthResult> {
  inFlight ??= signIn(timeoutMs).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Signed in already → nothing to do. Otherwise retries the sign-in (e.g. the
 * first launch was offline, or the backend refused it), but at most once per
 * RETRY_INTERVAL_MS, so callers can use it freely (app foreground, game over,
 * leaderboard). Never throws.
 */
export function ensureSignedIn(): Promise<AuthResult> {
  if (useAuthStore.getState().status === 'signedIn') return Promise.resolve('signedIn');
  if (inFlight) return inFlight;
  if (Date.now() - lastAttemptAt < RETRY_INTERVAL_MS) return Promise.resolve('offline');
  return initAuth();
}

async function signIn(timeoutMs: number): Promise<AuthResult> {
  lastAttemptAt = Date.now();
  const supabase = getSupabase();
  if (!supabase) {
    useAuthStore.setState({ status: 'offline' });
    return 'offline';
  }

  if (!listening) {
    listening = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        useAuthStore.setState({ status: 'offline', userId: null, displayName: null, isAnonymous: false });
        return;
      }
      // profile load is async; don't await inside the auth callback (Supabase advice)
      setTimeout(() => loadProfile(session.user.id, session.user.is_anonymous ?? false).catch(() => {}), 0);
    });
  }

  try {
    const { data } = await withTimeout(supabase.auth.getSession(), timeoutMs);
    let user = data.session?.user ?? null;
    if (!user) {
      const signIn = await withTimeout(supabase.auth.signInAnonymously(), timeoutMs);
      if (signIn.error) throw signIn.error;
      user = signIn.data.user;
    }
    if (!user) throw new Error('no user after sign-in');
    useAuthStore.setState({ status: 'signedIn', userId: user.id, isAnonymous: user.is_anonymous ?? false });
    await withTimeout(loadProfile(user.id, user.is_anonymous ?? false), timeoutMs).catch(() => {});
    return 'signedIn';
  } catch (e) {
    console.warn('Sign-in failed, playing offline', e);
    useAuthStore.setState({ status: 'offline' });
    return 'offline';
  }
}
