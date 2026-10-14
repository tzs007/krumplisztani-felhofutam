import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

type Props = TextInputProps & { label: string };

/** The parchment's light brown (the middle of modal-bg.png): the text on the dark field. */
const PARCHMENT = '#F9EDD4';

/** Labelled single-line text input: a dark field with parchment-coloured text, on the framed parchment panels. */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, editable = true, style, ...props }, ref) {
  return (
    <VStack space="xs">
      <Text size="sm" bold className="text-muted-foreground">
        {label}
      </Text>
      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor="#a3a3a3"
        selectionColor={PARCHMENT}
        className={`rounded-md border border-border px-3 py-3 text-base ${editable ? '' : 'opacity-50'}`}
        style={[{ backgroundColor: '#000000', color: PARCHMENT }, style]}
        {...props}
      />
    </VStack>
  );
});
