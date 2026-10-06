import type { Language } from "../i18n/i18n.ts";

/** Account-wide settings (one per user, synced through `settings.updated`). */
export type Settings = {
  readonly language: Language;
  /** IANA zone; `null` until the first device reports one. */
  readonly timezone: null | string;
  /** Digest times as `HH:MM` on the account's zone. */
  readonly digestWindows: readonly string[];
  readonly quietHours: { readonly from: string; readonly to: string };
};

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  timezone: null,
  digestWindows: ["09:00", "14:00", "21:00"],
  quietHours: { from: "23:00", to: "08:00" },
};
