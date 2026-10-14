import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

import { ensureSignedIn, initAuth, RETRY_INTERVAL_MS } from '../auth';
import { connectAndSync, syncResults, toRow } from '../resultsSync';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// minimal fake Supabase client
const mockState = {
  available: true,
  session: null as null | { user: { id: string; is_anonymous: boolean } },
  anonError: null as null | Error,
  upserts: [] as { rows: Record<string, unknown>[]; options: unknown }[],
  upsertError: null as null | Error,
};
jest.mock('../supabase', () => ({
  getSupabase: () =>
    mockState.available
      ? {
          auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            getSession: async () => ({ data: { session: mockState.session } }),
            signInAnonymously: async () =>
              mockState.anonError
                ? { data: { user: null }, error: mockState.anonError }
                : { data: { user: { id: 'anon-1', is_anonymous: true } }, error: null },
          },
          from: (table: string) => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: table === 'profiles' ? { display_name: 'Csibe #4821' } : null }),
              }),
            }),
            upsert: async (rows: Record<string, unknown>[], options: unknown) => {
              mockState.upserts.push({ rows, options });
              return { error: mockState.upsertError };
            },
          }),
        }
      : null,
}));

const addResult = (score: number) =>
  useAppStore
    .getState()
    .addResult({ score, platforms: score, pickups: 1, durationMs: 12345.6, playedAt: 1_700_000_000_000 + score });

beforeEach(() => {
  Object.assign(mockState, { available: true, session: null, anonError: null, upserts: [], upsertError: null });
  useAuthStore.setState({ status: 'loading', userId: null, displayName: null, isAnonymous: false });
  useAppStore.setState({ history: [], uploadedIds: [] });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('initAuth', () => {
  it('signs in anonymously on the first launch and loads the generated name', async () => {
    await expect(initAuth()).resolves.toBe('signedIn');
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedIn',
      userId: 'anon-1',
      isAnonymous: true,
      displayName: 'Csibe #4821',
    });
  });

  it('restores an existing session without signing in again', async () => {
    mockState.session = { user: { id: 'user-7', is_anonymous: false } };
    await initAuth();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'user-7', isAnonymous: false });
  });

  it('falls back to offline when the sign-in fails or there is no backend', async () => {
    mockState.anonError = new Error('Anonymous sign-ins are disabled');
    await expect(initAuth()).resolves.toBe('offline');
    mockState.available = false;
    await expect(initAuth()).resolves.toBe('offline');
    expect(useAuthStore.getState().status).toBe('offline');
  });
});

describe('ensureSignedIn', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now += 10 * RETRY_INTERVAL_MS; // the previous test's attempt is long past
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  it('retries a failed sign-in, at most once per retry interval', async () => {
    mockState.anonError = new Error('Anonymous sign-ins are disabled');
    await expect(initAuth()).resolves.toBe('offline');

    mockState.anonError = null; // enabled on the backend meanwhile
    await expect(ensureSignedIn()).resolves.toBe('offline'); // too soon, no new attempt
    now += RETRY_INTERVAL_MS;
    await expect(ensureSignedIn()).resolves.toBe('signedIn');
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'anon-1' });
  });

  it('does nothing when already signed in, and shares a running attempt', async () => {
    const first = ensureSignedIn();
    expect(ensureSignedIn()).toBe(first);
    await expect(first).resolves.toBe('signedIn');
    mockState.anonError = new Error('should not be called');
    await expect(ensureSignedIn()).resolves.toBe('signedIn');
  });

  it('connectAndSync uploads the queue once the retried sign-in succeeds', async () => {
    addResult(10);
    mockState.anonError = new Error('offline');
    await expect(connectAndSync()).resolves.toBe(0);
    mockState.anonError = null;
    now += RETRY_INTERVAL_MS;
    await expect(connectAndSync()).resolves.toBe(1);
  });
});

describe('syncResults', () => {
  it('uploads every result on this device after the first sign-in, then only new ones', async () => {
    const a = addResult(10);
    const b = addResult(20);
    await initAuth();
    await expect(syncResults()).resolves.toBe(2);
    expect(mockState.upserts[0].rows.map((r) => r.client_id).sort()).toEqual([a.id, b.id].sort());
    expect(mockState.upserts[0].options).toEqual({ onConflict: 'user_id,client_id', ignoreDuplicates: true });

    const c = addResult(30);
    await expect(syncResults()).resolves.toBe(1);
    expect(mockState.upserts[1].rows.map((r) => r.client_id)).toEqual([c.id]);
    await expect(syncResults()).resolves.toBe(0); // nothing left
  });

  it('keeps results queued while offline or when the upload fails', async () => {
    addResult(10);
    await expect(syncResults()).resolves.toBe(0); // not signed in
    await initAuth();
    mockState.upsertError = new Error('network');
    await expect(syncResults()).resolves.toBe(0);
    mockState.upsertError = null;
    await expect(syncResults()).resolves.toBe(1); // retried later
  });

  it('maps a device result to a server row', () => {
    const r = { id: 'x', score: 5, platforms: 4, pickups: 1, durationMs: 1234.7, playedAt: 0 };
    expect(toRow(r, 'u')).toEqual({
      user_id: 'u',
      client_id: 'x',
      score: 5,
      platforms: 4,
      pickups: 1,
      duration_ms: 1235,
      played_at: '1970-01-01T00:00:00.000Z',
    });
  });
});
