/**
The kinds of notification in the one pool every channel shows: a sign-in, the deadline digest,
a calendar event starting, and "still doing X?" for an activity past its Expect.
*/
export const NOTIFICATION_KINDS = [
  "login",
  "deadline_digest",
  "event_start",
  "activity_overrun",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Where a notification can show: the Telegram chat, the Android app, the web app. */
export const NOTIFICATION_CHANNELS = ["telegram", "app", "web"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type ChannelSwitches = Readonly<Record<NotificationChannel, boolean>>;

/** Per kind, which channels it goes to. */
export type NotificationChannels = Readonly<Record<NotificationKind, ChannelSwitches>>;

/** A `settings.updated` change to the channels: only the switches it names. */
export type NotificationChannelsPatch = Readonly<
  Partial<
    Record<
      NotificationKind,
      Readonly<Partial<Record<NotificationChannel, boolean | undefined>>> | undefined
    >
  >
>;

/**
The owner's defaults: a sign-in everywhere, the digest and an event starting in Telegram only,
"still doing X?" on the phone only.
*/
export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannels = {
  login: { telegram: true, app: true, web: true },
  deadline_digest: { telegram: true, app: false, web: false },
  event_start: { telegram: true, app: false, web: false },
  activity_overrun: { telegram: false, app: true, web: false },
};

/** The channels with a patch applied over them; switches it does not name stay. */
export const patchChannels = (
  current: NotificationChannels,
  patch: NotificationChannelsPatch,
): NotificationChannels =>
  Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => {
      const changes = Object.entries(patch[kind] ?? {}).filter(([, on]) => on !== undefined);
      return [kind, { ...current[kind], ...Object.fromEntries(changes) }];
    }),
  ) as NotificationChannels;

/**
Whether a kind goes to a channel. The one place this is decided: the server's delivery, the
feed's filter and the Settings switches all read it.
*/
export const isChannelOn = (
  settings: { readonly notificationChannels: NotificationChannels },
  kind: NotificationKind,
  channel: NotificationChannel,
): boolean => settings.notificationChannels[kind][channel];
