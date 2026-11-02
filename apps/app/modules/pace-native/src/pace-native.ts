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
  readonly hasUsageAccess: () => boolean;
  /** Android 13+: an app installed from an APK meets "restricted settings" for usage access. */
  readonly restrictsSettings: () => boolean;
  readonly openUsageAccessSettings: () => void;
  readonly isDndAccessGranted: () => boolean;
  readonly openDndAccessSettings: () => void;
  /** False when Do Not Disturb access was not granted. */
  readonly setDnd: (isEnabled: boolean) => boolean;
  readonly queryUsageEvents: (beginMs: number, endMs: number) => Promise<readonly UsageEvent[]>;
  readonly queryUsageStats: (beginMs: number, endMs: number) => Promise<readonly UsageStats[]>;
  /** Package id → the app's name as the launcher shows it (unknown ids map to themselves). */
  readonly appLabels: (packages: readonly string[]) => Promise<Readonly<Record<string, string>>>;
  /** Whether Android leaves Pace out of battery optimization (the background check runs on time). */
  readonly isIgnoringBatteryOptimizations: () => boolean;
  /** Android's own dialog that exempts Pace from battery optimization (or its list, when absent). */
  readonly requestIgnoreBatteryOptimizations: () => void;
  /** The phone maker's autostart page, when this phone has a known one; false when none. */
  readonly openAutostartSettings: () => boolean;
  /** Where the last crash's trace was saved (`Download/Pace/crash-….txt`), once; else null. */
  readonly takeLastCrash: () => null | string;
  /** Saves a trace the app caught itself (the crash screen) as a crash's; where it went, or null. */
  readonly saveCrashTrace: (trace: string) => null | string;
  /** What the app is doing (screen, sync…), written into the next crash file. */
  readonly setCrashContext: (text: string) => void;
};

const noop = (): void => undefined;

/**
What the app sees without the native module (Jest, Expo Go, the web): nothing granted, nothing to
do. The battery is no obstacle there, so the battery step is never asked for.
*/
export const fallbackPaceNative: PaceNative = {
  appLabels: async (packages) => Object.fromEntries(packages.map((name) => [name, name])),
  hasUsageAccess: () => false,
  isDndAccessGranted: () => false,
  isIgnoringBatteryOptimizations: () => true,
  openAutostartSettings: () => false,
  openDndAccessSettings: noop,
  openUsageAccessSettings: noop,
  queryUsageEvents: async () => [],
  queryUsageStats: async () => [],
  requestIgnoreBatteryOptimizations: noop,
  restrictsSettings: () => false,
  setDnd: () => false,
  saveCrashTrace: () => null,
  setCrashContext: noop,
  takeLastCrash: () => null,
};

/** The native module when it is linked, otherwise the fallback. */
export const resolvePaceNative = (native: null | PaceNative): PaceNative =>
  native ?? fallbackPaceNative;

export const PaceNative: PaceNative = resolvePaceNative(
  requireOptionalNativeModule<PaceNative>("PaceNative"),
);

/* eslint-enable @typescript-eslint/require-await -- end of the fallback */
