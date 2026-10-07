import { type TelegramLogin, TelegramLoginSchema } from "@pace/core";

/**
The Telegram Login Widget runs in redirect mode (`data-auth-url`): its callback mode
(`data-onauth`) evaluates a string with `new Function`, which our CSP forbids. After a
successful login Telegram sends the browser to this path with the signed fields in the
query; the page stores them for the widget that started the flow and goes back there.
*/
export const TELEGRAM_RETURN_PATH = "/auth/telegram";

const STORAGE_KEY = "pace.telegram-login";
const NUMERIC_FIELDS = new Set(["auth_date", "id"]);

/** The signed Telegram fields from a redirect query, or null when they are missing or malformed. */
export const parseTelegramLogin = (search: URLSearchParams): null | TelegramLogin => {
  const fields: Record<string, number | string> = {};
  for (const key of Object.keys(TelegramLoginSchema.shape)) {
    const value = search.get(key);
    if (value !== null) {
      fields[key] = NUMERIC_FIELDS.has(key) ? Number(value) : value;
    }
  }
  const parsed = TelegramLoginSchema.safeParse(fields);
  return parsed.success ? parsed.data : null;
};

/** Only a same-origin path is a valid return target (no open redirect). */
export const safeReturnPath = (value: null | string): string =>
  value !== null && value.startsWith("/") && !value.startsWith("//") ? value : "/login";

/** Where Telegram should send the browser back to, for the page that renders the widget. */
export const telegramAuthUrl = (
  location: Pick<Location, "origin" | "pathname" | "search">,
): string =>
  `${location.origin}${TELEGRAM_RETURN_PATH}?return=${encodeURIComponent(location.pathname + location.search)}`;

export const savePendingTelegramLogin = (login: TelegramLogin): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(login));
  } catch {
    // Storage can be unavailable (private mode); the widget then simply shows again.
  }
};

/** Reads and forgets a login stored by the return page. */
export const takePendingTelegramLogin = (): null | TelegramLogin => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = TelegramLoginSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
