/**
 * Supabase client (auth + database), set up as in the Expo guide:
 * https://docs.expo.dev/guides/using-supabase.md
 *
 * Config comes from EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (written by `eas integrations:supabase:connect` to .env.local and to the EAS
 * environments). Both are public by design — row level security protects the
 * data. Never put a secret / service-role key here.
 *
 * The client is created lazily by getSupabase(), and only when:
 * - the env vars are set, and
 * - the expo-sqlite native module (session storage) is in this binary.
 * Builds made before expo-sqlite was added can still receive this code as an
 * OTA update: they simply get null and the game runs on its bundled content.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireOptionalNativeModule } from 'expo';
import { AppState } from 'react-native';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient<Database> | null | undefined;

/** The shared client, or null when not configured / not supported by this build. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  if (!isSupabaseConfigured || !requireOptionalNativeModule('ExpoSQLite')) {
    client = null;
    return client;
  }

  // loaded only now (not via import), so older binaries without the native module never touch them
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-sqlite/localStorage/install');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');

  const created = createClient<Database>(url!, publishableKey!, {
    auth: {
      // expo-sqlite's localStorage keeps the session across app launches
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // refresh tokens only while the app is in the foreground (Supabase recommendation)
  AppState.addEventListener('change', (state) => {
    if (state === 'active') created.auth.startAutoRefresh();
    else created.auth.stopAutoRefresh();
  });

  client = created;
  return client;
}
