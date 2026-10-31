import type { PhoneEvent } from "@pace/core";

import { paceNative, type UsageEvent } from "../../modules/pace-native/index.ts";

/** Android's `UsageEvents.Event` types Pace reads; everything else is dropped. */
const EVENT_KIND: Readonly<Record<number, PhoneEvent["kind"]>> = {
  1: "app-start", // ACTIVITY_RESUMED
  2: "app-stop", // ACTIVITY_PAUSED
  15: "screen-on", // SCREEN_INTERACTIVE
  16: "screen-off", // SCREEN_NON_INTERACTIVE
  17: "lock", // KEYGUARD_SHOWN
  18: "unlock", // KEYGUARD_HIDDEN
  // The screen goes dark with the phone; a screen-off lost to a shutdown would stretch a use.
  26: "screen-off", // DEVICE_SHUTDOWN
};

const PACE = "dev.nalinor.pace";

/** The home screen, the system bars and Pace itself are not "using the phone" for anything. */
const isBackground = (packageName: string): boolean =>
  /launcher|systemui/u.test(packageName) || packageName === PACE;

/** Pace in front means someone has the phone unlocked, also on a phone without a lock screen. */
const isPaceOpened = (event: UsageEvent): boolean =>
  event.eventType === 1 && event.packageName === PACE;

/** Android usage events as Pace's phone events, oldest first. */
export const toPhoneEvents = (events: readonly UsageEvent[]): readonly PhoneEvent[] =>
  events
    .flatMap((event): readonly PhoneEvent[] => {
      const kind = EVENT_KIND[event.eventType];
      if (kind === undefined) {
        return [];
      }
      const at = new Date(event.timestamp).toISOString();
      if (isPaceOpened(event)) {
        return [{ at, kind: "unlock" }];
      }
      if (!kind.startsWith("app-")) {
        return [{ at, kind }];
      }
      return isBackground(event.packageName) ? [] : [{ app: event.packageName, at, kind }];
    })
    .toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at));

export type PhoneData = {
  /** Usage access was granted in Android settings. */
  readonly hasAccess: boolean;
  readonly events: readonly PhoneEvent[];
};

/** What the phone recorded between two instants; nothing (and no error) without usage access. */
export const readPhoneEvents = async (from: string, to: string): Promise<PhoneData> => {
  if (!paceNative.hasUsageAccess()) {
    return { events: [], hasAccess: false };
  }
  const raw = await paceNative.queryUsageEvents(Date.parse(from), Date.parse(to));
  return { events: toPhoneEvents(raw), hasAccess: true };
};

/** The apps' names as the launcher shows them. */
export const appLabels = async (
  packages: readonly string[],
): Promise<Readonly<Record<string, string>>> =>
  packages.length === 0 ? {} : await paceNative.appLabels(packages);

export const hasUsageAccess = (): boolean => paceNative.hasUsageAccess();

export const openUsageAccessSettings = (): void => {
  paceNative.openUsageAccessSettings();
};
