import type { Language } from "../i18n/i18n.ts";
import type { ActivityCategory } from "../tracking/model.ts";

import {
  DEFAULT_NOTIFICATION_CHANNELS,
  type NotificationChannels,
} from "./notification-channels.ts";

/** Account-wide settings (one per user, synced through `settings.updated`). */
export type Settings = {
  readonly language: Language;
  /** IANA zone; `null` until the first device reports one. */
  readonly timezone: null | string;
  /** Deadline digest times as `HH:MM` on the account's zone. */
  readonly digestWindows: readonly string[];
  /** Holds back "event starting" and "still doing X?"; sign-ins and digests always come. */
  readonly quietHours: { readonly from: string; readonly to: string };
  /** Week shows the whole day, 00–24, instead of starting at seven in the morning. */
  readonly nightHours: boolean;
  readonly categoryEstimates: Readonly<Partial<Record<ActivityCategory, number>>>;
  /** Per kind of notification, the channels it goes to. */
  readonly notificationChannels: NotificationChannels;
};

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  timezone: null,
  digestWindows: ["09:00", "14:00", "21:00"],
  quietHours: { from: "23:00", to: "08:00" },
  nightHours: false,
  categoryEstimates: {},
  notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
};
