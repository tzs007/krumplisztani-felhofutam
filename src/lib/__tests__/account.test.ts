import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

import { useAuthStore } from '@/store/useAuthStore';

import { authErrorMessage, validateCredentials, validateDisplayName } from '../accountForm';
import { initAuth, saveAccount, signInWithEmail, signOut, updateDisplayName } from '../auth';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

type MockUser = { id: string; is_anonymous: boolean; email?: string };
const mockState = {
  session: null as null | { user: MockUser },
  calls: [] as string[],
  error: null as null | { code: string; message: string },
  profileName: 'Csibe #4821',
  anonCount: 0,
};
const mockResult = (user: MockUser | null) =>
  mockState.error ? { data: { user: null }, error: mockState.error } : { data: { user }, error: null };

jest.mock('../supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: mockState.session } }),
      signInAnonymously: async () => {
        mockState.calls.push('signInAnonymously');
        const user = { id: `anon-${++mockState.anonCount}`, is_anonymous: true };
        mockState.session = { user };
        return { data: { user }, error: null };
      },
      updateUser: async ({ email }: { email: string }) => {
        mockState.calls.push(`updateUser:${email}`);
        return mockResult({ id: mockState.session!.user.id, is_anonymous: false, email });
      },
      signUp: async ({ email }: { email: string }) => {
        mockState.calls.push(`signUp:${email}`);
        return mockResult({ id: 'new-user', is_anonymous: false, email });
      },
      signInWithPassword: async ({ email }: { email: string }) => {
        mockState.calls.push(`signInWithPassword:${email}`);
        return mockResult({ id: 'existing', is_anonymous: false, email });
      },
      signOut: async () => {
        mockState.calls.push('signOut');
        mockState.session = null;
        return { error: null };
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: mockState.profileName } }) }) }),
      update: (row: { display_name: string }) => ({
        eq: async () => {
          mockState.calls.push(`rename:${row.display_name}`);
          return { error: mockState.error };
        },
      }),
    }),
  }),
}));

beforeEach(async () => {
  Object.assign(mockState, { session: null, calls: [], error: null, profileName: 'Csibe #4821', anonCount: 0 });
  useAuthStore.setState({ status: 'loading', userId: null, displayName: null, isAnonymous: false, email: null });
  await initAuth(); // anonymous guest, like on a first launch
  mockState.calls = [];
});

describe('account form validation', () => {
  it('checks email, password and name before any request', () => {
    expect(validateCredentials('', 'secret1')).toMatch(/email/);
    expect(validateCredentials('nope', 'secret1')).toMatch(/érvényes/);
    expect(validateCredentials('a@b.hu', '123')).toMatch(/6 karakter/);
    expect(validateCredentials(' a@b.hu ', 'secret1')).toBeNull();
    expect(validateDisplayName(' x ')).toMatch(/2–24/);
    expect(validateDisplayName('x'.repeat(25))).toMatch(/2–24/);
    expect(validateDisplayName('  Kotkodács  ')).toBeNull();
  });

  it('maps backend errors to Hungarian messages', () => {
    expect(authErrorMessage({ code: 'email_exists', message: '' })).toMatch(/már van fiók/);
    expect(authErrorMessage({ code: 'invalid_credentials', message: '' })).toMatch(/Hibás/);
    expect(authErrorMessage({ code: '23505', message: '' })).toMatch(/foglalt/);
    expect(authErrorMessage({ message: 'TypeError: Network request failed' })).toMatch(/kapcsolat/);
    expect(authErrorMessage({ code: 'something_new', message: '' })).toMatch(/hiba/);
  });
});

describe('saveAccount', () => {
  it('turns the guest account into an email account (same user id)', async () => {
    await expect(saveAccount(' csibe@test.hu ', 'secret1')).resolves.toBeNull();
    expect(mockState.calls).toEqual(['updateUser:csibe@test.hu']);
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'anon-1',
      isAnonymous: false,
      email: 'csibe@test.hu',
      displayName: 'Csibe #4821',
    });
  });

  it('signs up when there is no session at all', async () => {
    useAuthStore.setState({ status: 'offline', userId: null, isAnonymous: false });
    await expect(saveAccount('uj@test.hu', 'secret1')).resolves.toBeNull();
    expect(mockState.calls).toEqual(['signUp:uj@test.hu']);
  });

  it('rejects invalid input locally and reports a taken email', async () => {
    await expect(saveAccount('nope', 'secret1')).resolves.toMatch(/érvényes/);
    expect(mockState.calls).toEqual([]);
    mockState.error = { code: 'email_exists', message: 'already registered' };
    await expect(saveAccount('foglalt@test.hu', 'secret1')).resolves.toMatch(/már van fiók/);
    expect(useAuthStore.getState().isAnonymous).toBe(true); // still the guest
  });
});

describe('signInWithEmail / signOut', () => {
  it('switches to the existing account', async () => {
    mockState.profileName = 'Kotkodács';
    await expect(signInWithEmail('regi@test.hu', 'secret1')).resolves.toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ userId: 'existing', email: 'regi@test.hu', displayName: 'Kotkodács' });
  });

  it('reports wrong credentials', async () => {
    mockState.error = { code: 'invalid_credentials', message: 'Invalid login credentials' };
    await expect(signInWithEmail('regi@test.hu', 'rossz12')).resolves.toMatch(/Hibás/);
    expect(useAuthStore.getState().userId).toBe('anon-1');
  });

  it('continues as a new guest after signing out', async () => {
    await expect(signOut()).resolves.toBeNull();
    expect(mockState.calls).toEqual(['signOut', 'signInAnonymously']);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'anon-2', isAnonymous: true, email: null });
  });
});

describe('updateDisplayName', () => {
  it('saves the trimmed name', async () => {
    await expect(updateDisplayName('  Kotkodács ')).resolves.toBeNull();
    expect(mockState.calls).toEqual(['rename:Kotkodács']);
    expect(useAuthStore.getState().displayName).toBe('Kotkodács');
  });

  it("refuses someone else's generated name", async () => {
    mockState.error = { code: '23505', message: 'duplicate key' };
    await expect(updateDisplayName('Csibe #0001')).resolves.toMatch(/foglalt/);
    expect(useAuthStore.getState().displayName).toBe('Csibe #4821');
  });
});
