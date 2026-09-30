import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

type Props = TextInputProps & { label: string };

/** Labelled single-line text input in the app's card style. */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, editable = true, ...props }, ref) {
  return (
    <VStack space="xs">
      <Text size="sm" bold className="text-muted-foreground">
        {label}
      </Text>
      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor="#a3a3a3"
        className={`rounded-md border border-border bg-background px-3 py-3 text-base text-foreground ${editable ? '' : 'opacity-50'}`}
        {...props}
      />
    </VStack>
  );
});
