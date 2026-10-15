import type { Language } from "@pace/core";

/** Before sign-in there is no account preference; use the device's language. */
export const deviceLanguage = (): Language => {
  const locale =
    (globalThis.navigator as { language?: string }).language ??
    new Intl.DateTimeFormat().resolvedOptions().locale;
  return locale.toLowerCase().startsWith("ru") ? "ru" : "en";
};
