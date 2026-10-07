/**
Who may sign in (web, app, bot and MCP consent all ask here). With ids in
ALLOWED_TELEGRAM_IDS only those people pass and everyone else is 403 without a user row;
an empty list switches the whitelist off and lets any Telegram account in.
*/
export const isAllowed = (telegramId: string, allowedIds: readonly string[]): boolean =>
  allowedIds.length === 0 || allowedIds.includes(telegramId);
