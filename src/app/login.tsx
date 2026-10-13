import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormMessage } from '@/components/account/FormMessage';
import { ScreenHeader } from '@/components/account/ScreenHeader';
import { TextField } from '@/components/account/TextField';
import { SkyBackground } from '@/components/SkyBackground';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Paper } from '@/components/Paper';
import { signInWithEmail } from '@/lib/auth';
import { connectAndSync } from '@/lib/resultsSync';
import { useAuthStore } from '@/store/useAuthStore';

/** Sign in to an existing (email) account, e.g. on a new phone. */
export default function LoginRoute() {
  const insets = useSafeAreaInsets();
  const guestName = useAuthStore((s) => (s.status === 'signedIn' && s.isAnonymous ? s.displayName : null));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const err = await signInWithEmail(email, password);
    setBusy(false);
    setError(err);
    if (!err) {
      // results on this phone not uploaded yet go to the account just signed in to
      connectAndSync();
      router.back();
    }
  };

  return (
    <Box className="flex-1 bg-sky" style={{ paddingTop: insets.top }}>
      <SkyBackground />
      <ScreenHeader title="Belépés" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
        >
          <Paper className="gap-3 rounded-lg p-4">
            {guestName && (
              <Box className="rounded-md border-l-4 border-destructive bg-background px-3 py-2">
                <Text size="sm" className="text-foreground">
                  A mostani vendég fiókod ({guestName}) eredményei nem kerülnek át a másik fiókba. Ha meg akarod
                  tartani, inkább mentsd el a Fiók oldalon.
                </Text>
              </Box>
            )}
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCorrect={false}
            />
            <TextField
              label="Jelszó"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            <FormMessage error={error} />
            <Button isDisabled={busy} onPress={submit}>
              <ButtonText>{busy ? 'Belépés…' : 'Belépés'}</ButtonText>
            </Button>
          </Paper>
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}
