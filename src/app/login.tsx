import { router } from 'expo-router';
import { useState } from 'react';

import { EmailField, PasswordField } from '@/components/account/CredentialFields';
import { FormMessage } from '@/components/account/FormMessage';
import { FormPanel, FormScreen } from '@/components/account/FormScreen';
import { MenuButton } from '@/components/MenuButton';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { signInWithEmail } from '@/lib/auth';
import { connectAndSync } from '@/lib/resultsSync';
import { useAuthStore } from '@/store/useAuthStore';

/** Sign in to an existing (email) account, e.g. on a new phone. */
export default function LoginRoute() {
  const guestName = useAuthStore((s) => (s.status === 'signedIn' && s.isAnonymous ? s.displayName : null));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useAsyncAction(signInWithEmail);

  const submit = async () => {
    if (await run(email, password)) return;
    // results on this phone not uploaded yet go to the account just signed in to
    connectAndSync();
    router.back();
  };

  return (
    <FormScreen title="Belépés">
      <FormPanel>
        {guestName && (
          <Box className="rounded-md border-l-4 border-destructive bg-background px-3 py-2">
            <Text size="sm" className="text-foreground">
              A mostani vendég fiókod ({guestName}) eredményei nem kerülnek át a másik fiókba. Ha meg akarod tartani,
              inkább mentsd el a Fiók oldalon.
            </Text>
          </Box>
        )}
        <EmailField value={email} onChangeText={setEmail} />
        <PasswordField label="Jelszó" value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        <FormMessage error={error} />
        <MenuButton art="sign-in" label={busy ? 'Belépés…' : 'Belépés'} disabled={busy} onPress={submit} />
      </FormPanel>
    </FormScreen>
  );
}
