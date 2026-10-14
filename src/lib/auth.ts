/**
 * Player accounts. Every player gets an account automatically: on the first
 * launch the app signs in anonymously (Supabase anonymous sign-in), and the
 * database names the player "Csibe #1234". Saving the account with email +
 * password keeps the same user id, so nothing is lost; Google comes later.
 *
 * Nothing here ever blocks the game: without backend, network or when the
 * sign-in fails, the status is "offline" and results stay on the device.
 */
import type { User } from '@supabase/supabase-js';

import { useAuthStore } from '@/store/useAuthStore';

import { authErrorMessage, validateCredentials, validateDisplayName } from './accountForm';
import { singleFlight } from './singleFlight';
import { getSupabase } from './supabase';
import { withTimeout } from './withTimeout';

let listening = false;
let lastAttemptAt = -Infinity;

type AuthResult = 'offline' | 'signedIn';
/** null on success, otherwise a message for the player (Hungarian). */
export type ActionError = string | null;

/** A failed sign-in is retried by ensureSignedIn at most this often. */
export const RETRY_INTERVAL_MS = 15_000;

const OFFLINE_MESSAGE = 'Nincs kapcsolat a szerverrel. Próbáld újra később.';
/** The store with no player signed in. */
const SIGNED_OUT = { status: 'offline', userId: null, displayName: null, isAnonymous: false, email: null } as const;

async function loadProfile(user: User) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  useAuthStore.setState({
    status: 'signedIn',
    userId: user.id,
    isAnonymous: user.is_anonymous ?? false,
    email: user.email || null,
    displayName: data?.display_name ?? null,
  });
}

/** Restores the session or signs in anonymously; resolves with the resulting status. Never throws. */
export const initAuth = singleFlight(({ timeoutMs = 4000 }: { timeoutMs?: number } = {}) => signIn(timeoutMs));

/**
 * Signed in already → nothing to do. Otherwise retries the sign-in (e.g. the
 * first launch was offline, or the backend refused it), but at most once per
 * RETRY_INTERVAL_MS, so callers can use it freely (app foreground, game over,
 * leaderboard). Never throws.
 */
export function ensureSignedIn(): Promise<AuthResult> {
  if (useAuthStore.getState().status === 'signedIn') return Promise.resolve('signedIn');
  if (initAuth.isRunning()) return initAuth();
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
        useAuthStore.setState(SIGNED_OUT);
        return;
      }
      // profile load is async; don't await inside the auth callback (Supabase advice)
      setTimeout(() => loadProfile(session.user).catch(() => {}), 0);
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
    useAuthStore.setState({
      status: 'signedIn',
      userId: user.id,
      isAnonymous: user.is_anonymous ?? false,
      email: user.email || null,
    });
    await withTimeout(loadProfile(user), timeoutMs).catch(() => {});
    return 'signedIn';
  } catch (e) {
    console.warn('Sign-in failed, playing offline', e);
    useAuthStore.setState({ status: 'offline' });
    return 'offline';
  }
}

/**
 * Registration. An anonymous player's account gets the email + password
 * (same user id: the name and the uploaded results stay); without any
 * session a new account is created. Email confirmation is off on the
 * backend, so the account is ready right away.
 */
export async function saveAccount(email: string, password: string): Promise<ActionError> {
  const invalid = validateCredentials(email, password);
  if (invalid) return invalid;
  const supabase = getSupabase();
  if (!supabase) return OFFLINE_MESSAGE;
  const creds = { email: email.trim(), password };

  const { status, isAnonymous } = useAuthStore.getState();
  const { data, error } =
    status === 'signedIn' && isAnonymous ? await supabase.auth.updateUser(creds) : await supabase.auth.signUp(creds);
  if (error) return authErrorMessage(error);
  if (data.user) await loadProfile(data.user).catch(() => {});
  return null;
}

/** Signs in to an existing account (switching away from the current, e.g. anonymous, one). */
export async function signInWithEmail(email: string, password: string): Promise<ActionError> {
  const invalid = validateCredentials(email, password);
  if (invalid) return invalid;
  const supabase = getSupabase();
  if (!supabase) return OFFLINE_MESSAGE;
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return authErrorMessage(error);
  await loadProfile(data.user).catch(() => {});
  return null;
}

/** Signs out, then continues as a new anonymous player (playing never needs an account). */
export async function signOut(): Promise<ActionError> {
  const supabase = getSupabase();
  if (!supabase) return OFFLINE_MESSAGE;
  const { error } = await supabase.auth.signOut();
  if (error) return authErrorMessage(error);
  useAuthStore.setState(SIGNED_OUT);
  await initAuth();
  return null;
}

/** Renames the player (2–24 characters; someone else's generated "Csibe #…" name is taken). */
export async function updateDisplayName(name: string): Promise<ActionError> {
  const invalid = validateDisplayName(name);
  if (invalid) return invalid;
  const supabase = getSupabase();
  const { status, userId } = useAuthStore.getState();
  if (!supabase || status !== 'signedIn' || !userId) return OFFLINE_MESSAGE;
  const displayName = name.trim();
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
  if (error) return authErrorMessage(error);
  useAuthStore.setState({ displayName });
  return null;
}
