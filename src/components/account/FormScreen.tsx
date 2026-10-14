import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalPanel } from '@/components/ModalPanel';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SkyBackground } from '@/components/SkyBackground';
import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';

/** A form screen over the sky: back button and title, then a scrolling column that keeps clear of the keyboard. */
export function FormScreen({ title, children }: { title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Box className="flex-1 bg-sky" style={{ paddingTop: insets.top }}>
      <SkyBackground />
      <ScreenHeader title={title} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}

/** The gold-framed parchment of the modals, centred at its maximum width; with an optional heading. */
export function FormPanel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <ModalPanel style={{ alignSelf: 'center' }}>
      <VStack space="md">
        {title && (
          <Heading size="md" className="text-foreground">
            {title}
          </Heading>
        )}
        {children}
      </VStack>
    </ModalPanel>
  );
}
