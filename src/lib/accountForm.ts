/**
 * Validation and player-facing (Hungarian) messages for the account forms.
 * The same rules are enforced by the backend; checking here first gives
 * instant feedback without a round trip.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 24;
export const PASSWORD_MIN = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Add meg az email címed.';
  if (!EMAIL_RE.test(email.trim())) return 'Ez nem tűnik érvényes email címnek.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `A jelszó legalább ${PASSWORD_MIN} karakter legyen.`;
  return null;
}

export function validateCredentials(email: string, password: string): string | null {
  return validateEmail(email) ?? validatePassword(password);
}

export function validateDisplayName(name: string): string | null {
  const n = name.trim().length;
  if (n < NAME_MIN || n > NAME_MAX) return `A név ${NAME_MIN}–${NAME_MAX} karakter legyen.`;
  return null;
}

/** Supabase Auth error codes and Postgres error codes → message for the player. */
const MESSAGES: Record<string, string> = {
  email_exists: 'Ezzel az email címmel már van fiók. Lépj be vele.',
  user_already_exists: 'Ezzel az email címmel már van fiók. Lépj be vele.',
  invalid_credentials: 'Hibás email cím vagy jelszó.',
  weak_password: `A jelszó túl gyenge (legalább ${PASSWORD_MIN} karakter).`,
  validation_failed: 'Ez nem tűnik érvényes email címnek.',
  email_address_invalid: 'Ez nem tűnik érvényes email címnek.',
  over_request_rate_limit: 'Túl sok próbálkozás. Várj egy kicsit, és próbáld újra.',
  over_email_send_rate_limit: 'Túl sok próbálkozás. Várj egy kicsit, és próbáld újra.',
  signup_disabled: 'A regisztráció most nem elérhető.',
  // Postgres: someone else's generated "Csibe #…" name / length check
  '23505': 'Ez a név már foglalt, válassz másikat.',
  '23514': `A név ${NAME_MIN}–${NAME_MAX} karakter legyen.`,
};

export function authErrorMessage(error: { code?: string | null; message?: string } | null | undefined): string {
  const byCode = error?.code ? MESSAGES[error.code] : undefined;
  if (byCode) return byCode;
  if (error?.message && /fetch|network/i.test(error.message))
    return 'Nincs kapcsolat a szerverrel. Próbáld újra később.';
  return 'Valami hiba történt. Próbáld újra.';
}
