/** Only people listed in ALLOWED_TELEGRAM_IDS may sign in; everyone else is 403, never a user row. */
export const isAllowed = (telegramId: string, allowedIds: readonly string[]): boolean =>
  allowedIds.includes(telegramId);
