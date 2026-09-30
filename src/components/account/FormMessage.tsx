import { Text } from '@/components/ui/text';

/** Error (red) or confirmation (muted) line under a form; renders nothing without a message. */
export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <Text className="text-destructive">{error}</Text>;
  if (success) return <Text className="text-muted-foreground">{success}</Text>;
  return null;
}
