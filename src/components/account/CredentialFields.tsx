import { TextField } from './TextField';

type Props = { value: string; onChangeText: (text: string) => void };

export function EmailField(props: Props) {
  return (
    <TextField
      label="Email"
      autoCapitalize="none"
      autoComplete="email"
      keyboardType="email-address"
      textContentType="emailAddress"
      autoCorrect={false}
      {...props}
    />
  );
}

/** `isNew`: choosing a password (registration), so the system offers to generate and save one. */
export function PasswordField({
  label,
  isNew = false,
  onSubmitEditing,
  ...props
}: Props & { label: string; isNew?: boolean; onSubmitEditing: () => void }) {
  return (
    <TextField
      label={label}
      secureTextEntry
      autoComplete={isNew ? 'new-password' : 'current-password'}
      textContentType={isNew ? 'newPassword' : 'password'}
      onSubmitEditing={onSubmitEditing}
      {...props}
    />
  );
}
