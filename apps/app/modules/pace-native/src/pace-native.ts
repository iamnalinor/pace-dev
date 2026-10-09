/* eslint-disable @typescript-eslint/require-await -- the fallback answers the async queries synchronously */
import { requireOptionalNativeModule } from "expo";

/** One `UsageStatsManager` event; `eventType` is Android's `UsageEvents.Event` constant. */
export type UsageEvent = {
  readonly packageName: string;
  readonly className: null | string;
  readonly eventType: number;
  readonly timestamp: number;
};

export type UsageStats = {
  readonly packageName: string;
  readonly firstTimestamp: number;
  readonly lastTimestamp: number;
  readonly lastTimeUsed: number;
  readonly totalTimeInForeground: number;
};

/** The Kotlin module's surface (`modules/pace-native/android`). */
export type PaceNative = {
  readonly canScheduleExactAlarms: () => boolean;
  readonly openExactAlarmSettings: () => void;
  readonly hasUsageAccess: () => boolean;
  readonly openUsageAccessSettings: () => void;
  readonly isDndAccessGranted: () => boolean;
  readonly openDndAccessSettings: () => void;
  /** False when Do Not Disturb access was not granted. */
  readonly setDnd: (isEnabled: boolean) => boolean;
  readonly queryUsageEvents: (beginMs: number, endMs: number) => Promise<readonly UsageEvent[]>;
  readonly queryUsageStats: (beginMs: number, endMs: number) => Promise<readonly UsageStats[]>;
  /** Appends a report to the crash log, synchronously: the app may be about to die. */
  readonly appendCrashReport: (kind: string, details: string) => void;
  /** The whole crash log (the newest 64 KB), "" when empty. */
  readonly readCrashLog: () => string;
  /** The reports logged since the last call, each returned once ("" when none). */
  readonly takeUnseenCrashes: () => string;
  readonly clearCrashLog: () => void;
  /** Package id → the app's name as the launcher shows it (unknown ids map to themselves). */
  readonly appLabels: (packages: readonly string[]) => Promise<Readonly<Record<string, string>>>;
};

const noop = (): void => undefined;

/** What the app sees without the native module (Jest, Expo Go): nothing granted, nothing to do. */
export const fallbackPaceNative: PaceNative = {
  appendCrashReport: noop,
  appLabels: async (packages) => Object.fromEntries(packages.map((name) => [name, name])),
  canScheduleExactAlarms: () => false,
  clearCrashLog: noop,
  hasUsageAccess: () => false,
  isDndAccessGranted: () => false,
  openDndAccessSettings: noop,
  openExactAlarmSettings: noop,
  openUsageAccessSettings: noop,
  queryUsageEvents: async () => [],
  queryUsageStats: async () => [],
  readCrashLog: () => "",
  setDnd: () => false,
  takeUnseenCrashes: () => "",
};

/** The native module when it is linked, otherwise the fallback. */
export const resolvePaceNative = (native: null | PaceNative): PaceNative =>
  native ?? fallbackPaceNative;

export const PaceNative: PaceNative = resolvePaceNative(
  requireOptionalNativeModule<PaceNative>("PaceNative"),
);

/* eslint-enable @typescript-eslint/require-await -- end of the fallback */
