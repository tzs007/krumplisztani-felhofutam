import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormMessage } from '@/components/account/FormMessage';
import { ScreenHeader } from '@/components/account/ScreenHeader';
import { TextField } from '@/components/account/TextField';
import { SkyBackground } from '@/components/SkyBackground';
import { Box } from '@/components/ui/box';
import { MenuButton } from '@/components/MenuButton';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { ModalPanel } from '@/components/ModalPanel';
import { NAME_MAX } from '@/lib/accountForm';
import { ensureSignedIn, saveAccount, signOut, updateDisplayName } from '@/lib/auth';
import { connectAndSync } from '@/lib/resultsSync';
import { useAuthStore } from '@/store/useAuthStore';


function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // the gold-framed parchment of the modals, centred at its maximum width
    <ModalPanel style={{ alignSelf: 'center' }}>
      <VStack space="md">
        <Heading size="md" className="text-foreground">
          {title}
        </Heading>
        {children}
      </VStack>
    </ModalPanel>
  );
}

/** Player name. The draft follows the stored name until the player edits it. */
function NameCard() {
  const displayName = useAuthStore((s) => s.displayName);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string | null; success?: string | null }>({});
  const value = draft ?? displayName ?? '';
  const changed = draft !== null && draft.trim() !== displayName;

  const save = async () => {
    setBusy(true);
    const error = await updateDisplayName(value);
    setBusy(false);
    if (error) setMsg({ error });
    else {
      setDraft(null);
      setMsg({ success: 'Elmentve. A ranglistán már így szerepelsz.' });
    }
  };

  return (
    <Card title="Neved">
      <TextField
        label="Ezen a néven szerepelsz a ranglistán"
        value={value}
        onChangeText={(t) => {
          setDraft(t);
          setMsg({});
        }}
        maxLength={NAME_MAX}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => changed && save()}
      />
      <FormMessage {...msg} />
      <MenuButton art="save-name" label={busy ? 'Mentés…' : 'Név mentése'} disabled={!changed || busy} onPress={save} />
    </Card>
  );
}

/** Guest account → email + password on the same account (name and results stay). */
function SaveAccountCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const err = await saveAccount(email, password);
    setBusy(false);
    setError(err);
    if (!err) {
      setPassword('');
      connectAndSync();
    }
  };

  return (
    <Card title="Vendég fiók">
      <Text className="text-foreground">
        Most vendégként játszol: a neved és az eredményeid ehhez a telefonhoz kötődnek. Mentsd el a fiókod email
        címmel, és bármelyik eszközről visszaléphetsz.
      </Text>
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
        label="Jelszó (legalább 6 karakter)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      <FormMessage error={error} />
      <MenuButton art="save-account" label={busy ? 'Mentés…' : 'Fiók mentése'} disabled={busy} onPress={submit} />
      <Button variant="link" onPress={() => router.push('/login')}>
        <ButtonText>Van már fiókod? Belépés</ButtonText>
      </Button>
    </Card>
  );
}

function SignedInCard({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmSignOut = () =>
    Alert.alert('Kijelentkezel?', 'Utána vendégként játszhatsz tovább; a fiókodba bármikor visszaléphetsz.', [
      { text: 'Mégse', style: 'cancel' },
      {
        text: 'Kijelentkezés',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(await signOut());
          setBusy(false);
        },
      },
    ]);

  return (
    <Card title="Fiók">
      <Text className="text-foreground">
        Belépve: <Text bold>{email}</Text>
      </Text>
      <FormMessage error={error} />
      <Button variant="secondary" isDisabled={busy} onPress={confirmSignOut}>
        <ButtonText>{busy ? 'Kijelentkezés…' : 'Kijelentkezés'}</ButtonText>
      </Button>
    </Card>
  );
}

export default function AccountRoute() {
  const insets = useSafeAreaInsets();
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
    <Box className="flex-1 bg-sky" style={{ paddingTop: insets.top }}>
      <SkyBackground />
      <ScreenHeader title="Fiók" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
        >
          {status === 'loading' && <Spinner size="large" className="mt-8 text-sky-foreground" />}
          {status === 'offline' && (
            <Card title="Nincs kapcsolat">
              <Text className="text-foreground">
                Most nem érjük el a szervert, ezért az eredményeid csak ezen a telefonon vannak meg. A játékhoz nem
                kell fiók.
              </Text>
              <Button isDisabled={retrying} onPress={retry}>
                <ButtonText>{retrying ? 'Kapcsolódás…' : 'Újrapróbálom'}</ButtonText>
              </Button>
            </Card>
          )}
          {status === 'signedIn' && (
            <>
              <NameCard />
              {isAnonymous || !email ? <SaveAccountCard /> : <SignedInCard email={email} />}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}
