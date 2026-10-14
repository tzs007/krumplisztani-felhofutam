import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { EmailField, PasswordField } from '@/components/account/CredentialFields';
import { FormMessage } from '@/components/account/FormMessage';
import { FormPanel, FormScreen } from '@/components/account/FormScreen';
import { TextField } from '@/components/account/TextField';
import { MenuButton } from '@/components/MenuButton';
import { Button, ButtonText } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { NAME_MAX } from '@/lib/accountForm';
import { ensureSignedIn, saveAccount, signOut, updateDisplayName } from '@/lib/auth';
import { connectAndSync } from '@/lib/resultsSync';
import { useAuthStore } from '@/store/useAuthStore';

/** Player name. The draft follows the stored name until the player edits it. */
function NameCard() {
  const displayName = useAuthStore((s) => s.displayName);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { run, busy, error, setError } = useAsyncAction(updateDisplayName);
  const value = draft ?? displayName ?? '';
  const changed = draft !== null && draft.trim() !== displayName;

  const save = async () => {
    if (await run(value)) return;
    setDraft(null);
    setSaved(true);
  };

  return (
    <FormPanel title="Neved">
      <TextField
        label="Ezen a néven szerepelsz a ranglistán"
        value={value}
        onChangeText={(t) => {
          setDraft(t);
          setError(null);
          setSaved(false);
        }}
        maxLength={NAME_MAX}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => changed && save()}
      />
      <FormMessage error={error} success={saved ? 'Elmentve. A ranglistán már így szerepelsz.' : null} />
      <MenuButton art="save-name" label={busy ? 'Mentés…' : 'Név mentése'} disabled={!changed || busy} onPress={save} />
    </FormPanel>
  );
}

/** Guest account → email + password on the same account (name and results stay). */
function SaveAccountCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { run, busy, error } = useAsyncAction(saveAccount);

  const submit = async () => {
    if (await run(email, password)) return;
    setPassword('');
    connectAndSync();
  };

  return (
    <FormPanel title="Vendég fiók">
      <Text className="text-foreground">
        Most vendégként játszol: a neved és az eredményeid ehhez a telefonhoz kötődnek. Mentsd el a fiókod email címmel,
        és bármelyik eszközről visszaléphetsz.
      </Text>
      <EmailField value={email} onChangeText={setEmail} />
      <PasswordField
        label="Jelszó (legalább 6 karakter)"
        isNew
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <FormMessage error={error} />
      <MenuButton art="save-account" label={busy ? 'Mentés…' : 'Fiók mentése'} disabled={busy} onPress={submit} />
      <Button variant="link" onPress={() => router.push('/login')}>
        <ButtonText>Van már fiókod? Belépés</ButtonText>
      </Button>
    </FormPanel>
  );
}

function SignedInCard({ email }: { email: string }) {
  const { run, busy, error } = useAsyncAction(signOut);

  const confirmSignOut = () =>
    Alert.alert('Kijelentkezel?', 'Utána vendégként játszhatsz tovább; a fiókodba bármikor visszaléphetsz.', [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Kijelentkezés', style: 'destructive', onPress: () => run() },
    ]);

  return (
    <FormPanel title="Fiók">
      <Text className="text-foreground">
        Belépve: <Text bold>{email}</Text>
      </Text>
      <FormMessage error={error} />
      <Button variant="secondary" isDisabled={busy} onPress={confirmSignOut}>
        <ButtonText>{busy ? 'Kijelentkezés…' : 'Kijelentkezés'}</ButtonText>
      </Button>
    </FormPanel>
  );
}

export default function AccountRoute() {
  const status = useAuthStore((s) => s.status);
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const email = useAuthStore((s) => s.email);
  const [retrying, setRetrying] = useState(false);

  // opened before the splash signed in (e.g. a deep link): start it here
  useEffect(() => {
    ensureSignedIn();
  }, []);

  const retry = async () => {
    setRetrying(true);
    if ((await ensureSignedIn()) === 'signedIn') connectAndSync();
    setRetrying(false);
  };

  return (
    <FormScreen title="Fiók">
      {status === 'loading' && <Spinner size="large" className="mt-8 text-sky-foreground" />}
      {status === 'offline' && (
        <FormPanel title="Nincs kapcsolat">
          <Text className="text-foreground">
            Most nem érjük el a szervert, ezért az eredményeid csak ezen a telefonon vannak meg. A játékhoz nem kell
            fiók.
          </Text>
          <Button isDisabled={retrying} onPress={retry}>
            <ButtonText>{retrying ? 'Kapcsolódás…' : 'Újrapróbálom'}</ButtonText>
          </Button>
        </FormPanel>
      )}
      {status === 'signedIn' && (
        <>
          <NameCard />
          {isAnonymous || !email ? <SaveAccountCard /> : <SignedInCard email={email} />}
        </>
      )}
    </FormScreen>
  );
}
