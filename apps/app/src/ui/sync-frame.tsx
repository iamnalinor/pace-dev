import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PaceRuntime } from "#app/runtime.ts";

import {
  useAuth,
  useIsAccountUnknown,
  useIsFirstSync,
  useIsOffline,
  usePace,
  useT,
} from "#app/app-state.tsx";
import { useIsDeviceOffline } from "#app/platform/device-offline.ts";
import { canStartSenders } from "#app/senders.ts";
import { type MessageKey, shadow, z } from "@pace/core";

import { cx } from "./cx.ts";
import { useFloatPlace, usePublishStatus } from "./float-layer.ts";
import { Icon, type IconName } from "./icon.tsx";
import { Pressable } from "./pressable.tsx";
import { Skeleton } from "./skeleton.tsx";
import { Text } from "./text.tsx";
import { useTheme } from "./theme-provider.tsx";
import { useBreakpoint } from "./use-breakpoint.ts";

/**
How long the first sync may hide the app. A pull that never answers (a stalled connection, a
proxy holding the request) would otherwise hold the whole app, Log out included (review I2).
*/
export const FIRST_SYNC_COVER_MS = 10_000;

/**
A problem with the server itself (its configuration), told by the app's composer: what to say and
the control that asks again. The kit knows nothing of servers.
*/
export type ServerProblem = { readonly message: MessageKey; readonly action: ReactNode };

const CARD = "max-w-toast-max rounded-lg border border-separator bg-elevated pl-4 pr-1";

/**
The strip's card: an icon, the line and its control, with the toast's rounded corners (a pill's
ends would cut into a second line). A short line keeps its control beside it; a `stacked` one (a
server's problem: a sentence or two, longer in Russian) takes the card's width with the control
under it at the end, so the words are not squeezed into a narrow column beside a wide Retry.
*/
export const SyncPill = ({
  action,
  icon,
  isStacked = false,
  message,
  onLayout,
}: {
  readonly action: ReactNode;
  readonly icon: IconName;
  readonly isStacked?: boolean;
  readonly message: string;
  readonly onLayout?: (event: {
    readonly nativeEvent: { readonly layout: { readonly height: number } };
  }) => void;
}) => {
  const { scheme } = useTheme();
  const line = (
    <>
      <Icon name={icon} size="inline" tone="secondary" />
      <Text className="py-2" role="footnote" tone="secondary">
        {message}
      </Text>
    </>
  );
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cx(CARD, isStacked ? "pt-1" : "min-h-hit-web flex-row items-center gap-2")}
      onLayout={onLayout}
      role="status"
      style={{ boxShadow: shadow(scheme, "overlay") }}
      testID="sync-strip"
    >
      {isStacked ? (
        <>
          <View className="flex-row items-center gap-2 pr-3">{line}</View>
          {action === null ? null : <View className="flex-row justify-end">{action}</View>}
        </>
      ) : (
        <>
          {line}
          {action}
        </>
      )}
    </View>
  );
};

/**
A card floating low over the page: offline while the last sync could not reach the server (what
is written stays on the device and goes out on reconnect, QA round 17 M5), not loaded yet while a
first sync reached the server and failed (QA round 21 M4: an HTTP 500 said nothing), still
syncing once the first sync outlasts its cover, or the server's own problem. All but the third
offer Retry. It floats over the page rather than sitting in the layout, so the page never moves
under the person as it comes and goes (QA round 18 L11: a line in the layout pushed everything
down 37 px mid-typing), and sits at the foot of the bottom stack: clear of the measured tab bar
and the screen's footer (at the top it lay over the header's Back, bell and task actions, round 7
review 3), inside the content region (at 1440 it straddled the column's edge, R23-13a), with a
toast stacked above it rather than over its Retry (review #6). A press goes through around it.
*/
const SyncStrip = ({
  message,
  problem,
}: {
  readonly message: MessageKey;
  readonly problem: null | ServerProblem;
}) => {
  const t = useT();
  const { bottom, left, right } = useFloatPlace();
  const [height, setHeight] = useState(0);
  usePublishStatus(height);
  const canRetry = message === "errors.offline" || message === "sync.notSyncedYet";
  const retry = canRetry ? <RetryNow /> : null;
  return (
    <View
      className="absolute items-center"
      pointerEvents="box-none"
      style={{ bottom, left, right, zIndex: z.toast }}
    >
      <SyncPill
        action={problem === null ? retry : problem.action}
        icon={stripIcon(message, problem)}
        isStacked={problem !== null}
        message={t(message)}
        onLayout={(event) => {
          setHeight(event.nativeEvent.layout.height);
        }}
      />
    </View>
  );
};

const stripIcon = (message: MessageKey, problem: null | ServerProblem): IconName => {
  if (problem !== null) {
    return "triangle-alert";
  }
  return message === "errors.offline" ? "cloud-off" : "refresh-cw";
};

/**
Tries the server again now, rather than at the end of the backoff (up to a minute after the
server is back, QA round 20 L2): the socket and a sync run, as on the way back online. Its own
box is a full 44 px target: react-native-web ignores `hitSlop` (round 7 review 3).
*/
const RetryNow = () => {
  const t = useT();
  const runtime = usePace();
  return (
    <Pressable
      className="min-h-hit-web min-w-hit-web items-center justify-center rounded-pill px-3"
      onPress={() => {
        backOnline(runtime);
      }}
      role="button"
    >
      <Text className="font-semibold" role="footnote" tone="accent">
        {t("sync.retry")}
      </Text>
    </Pressable>
  );
};

/** True once `isActive` has held for `ms` without a break; false again as soon as it stops. */
const useHasLasted = (isActive: boolean, ms: number): boolean => {
  // Each stretch of `isActive` is counted, so a timer of an earlier stretch never speaks for this one.
  const [stretch, setStretch] = useState({ count: 0, isActive });
  if (stretch.isActive !== isActive) {
    setStretch({ count: stretch.count + 1, isActive });
  }
  const [lasted, setLasted] = useState<null | number>(null);
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const timer = setTimeout(() => {
      setLasted(stretch.count);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [isActive, ms, stretch.count]);
  return isActive && lasted === stretch.count;
};

/** What the pill says, if anything: offline comes first, then a first sync that failed. */
const stripMessage = ({
  hasFirstSyncFailed,
  isOffline,
  isOverdue,
}: {
  readonly hasFirstSyncFailed: boolean;
  readonly isOffline: boolean;
  readonly isOverdue: boolean;
}): MessageKey | null => {
  if (isOffline) {
    return "errors.offline";
  }
  if (hasFirstSyncFailed) {
    return "sync.notSyncedYet";
  }
  return isOverdue ? "sync.stillSyncing" : null;
};

/**
Back on the network: a Log out the server did not hear is sent again, the sync runs at once, and
the socket starts again only in a tab the person sees. A hidden tab's socket rests (the app's visibility rule): it starts when the tab is shown.
*/
export const backOnline = (runtime: PaceRuntime): void => {
  const { live, sync } = runtime;
  // A Log out the server did not hear goes again, signed in or not (R22-02).
  void runtime.auth.retryEndedSessions();
  // Not while this device ends its own session (class 75): it would 401 as "ended elsewhere".
  if (!canStartSenders(runtime)) {
    return;
  }
  if (AppState.currentState === "active") {
    live.stop();
    live.start();
  }
  void sync.syncNow();
};

const useIsDeviceOfflineWithReconnect = (): boolean => {
  const runtime = usePace();
  const reconnect = useCallback(() => {
    backOnline(runtime);
  }, [runtime]);
  return useIsDeviceOffline(reconnect);
};

const HIDDEN = { display: "none" } as const;

/**
Grey rows where the screen will be, under one line that says what is happening (QA round 18 M5:
a bare skeleton said nothing, and a reader heard nothing). The account's language is not known
yet, so the line is in the device's (`useT` before the first sync); no screen's own words show.
Beside a tablet's or a computer's window it is drawn in the shell's own frame: the navigation's
column, empty (its labels would be in the device's language), and the rows where the screen's
column starts, so nothing jumps when the app is shown (QA PR55-1-13: no sidebar, and the rows
80 px right of the content).
*/
const FirstSyncPlaceholder = () => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const breakpoint = useBreakpoint();
  const rows = (
    <View
      className={cx(
        "w-full gap-4 px-gutter md:px-gutter-pane lg:px-gutter-lg",
        breakpoint === "compact" ? "max-w-content-wide self-center" : "max-w-content self-start",
      )}
      style={{ paddingTop: insets.top + 32 }}
    >
      <Text role="callout" tone="secondary">
        {t("sync.firstSyncLine")}
      </Text>
      <Skeleton label={t("sync.firstSync")} rows={6} />
    </View>
  );
  return breakpoint === "compact" ? (
    <View className="flex-1 bg-app">{rows}</View>
  ) : (
    <View className="flex-1 flex-row bg-app" testID="first-sync-shell">
      <View
        className={cx(
          "border-r border-separator bg-sidebar",
          breakpoint === "expanded" ? "w-sidebar" : "w-rail",
        )}
        testID="first-sync-navigation"
      />
      <View className="min-w-0 flex-1">{rows}</View>
    </View>
  );
};

const useIsOfflineStatus = (status: ReturnType<typeof useAuth>["status"]): boolean => {
  const isDeviceOffline = useIsDeviceOfflineWithReconnect();
  return useIsOffline() || (status === "signed-in" && isDeviceOffline);
};

const NO_RECONNECT = (): void => undefined;

/**
Why the sync line offers its Retry, if it does: offline, or a first sync that ended without
success on an empty copy (`not-loaded`). A screen's own failed read in the same moment says what
failed with no Retry of its own: the line's is the one control for the job (QA PR55-1-09), and the
read is made again once the line goes (`useBlockRetry`). Read anywhere under the frame; the
reconnect itself stays the frame's.
*/
export const useSyncRetryReason = (): "not-loaded" | "offline" | null => {
  const { status } = useAuth();
  const isDeviceOffline = useIsDeviceOffline(NO_RECONNECT);
  const isOffline = useIsOffline() || (status === "signed-in" && isDeviceOffline);
  const isFirstSync = useIsFirstSync();
  const isUnknown = useIsAccountUnknown();
  if (isOffline) {
    return "offline";
  }
  return isUnknown && !isFirstSync ? "not-loaded" : null;
};

const useSyncPresentation = (isBare: boolean, serverProblem: null | ServerProblem) => {
  const { status } = useAuth();
  const problem = status === "signed-in" && !isBare ? serverProblem : null;
  const hasConfigurationError = problem !== null;
  const isOffline = useIsOfflineStatus(status);
  const isFirstSync = useIsFirstSync() && !isBare;
  // A run of this session ended and none has succeeded: the screens keep grey rows (M4).
  const hasFirstSyncFailed = useIsAccountUnknown() && !isBare && !isFirstSync;
  const isOverdue = useHasLasted(isFirstSync, FIRST_SYNC_COVER_MS);
  const isCovered = isFirstSync && !isOverdue && !hasConfigurationError;
  const message =
    problem === null ? stripMessage({ hasFirstSyncFailed, isOffline, isOverdue }) : problem.message;
  return { isCovered, message, problem };
};

/**
The app under the sync line, and covered while it waits for its first sync.

- Covered (sidebar included) while a signed-in copy that holds nothing waits for its first sync
  (QA round 17 M4): no final empty state ("Nothing to do right now") and no word in the device's
  language while the account's is not known yet. The app stays mounted, only not drawn, so no
  navigator mounts late (bug class 61).
- The cover lasts `FIRST_SYNC_COVER_MS` at most: then the app is shown under a "still syncing"
  line, usable, until that sync ends (review I2).
- The offline line while the last sync could not reach the server or the device says it has no
  network.
- The not-loaded line, with Retry, while a first sync on an empty copy ended without success
  (QA round 21 M4); the screens keep their grey rows meanwhile.
*/
export const SyncFrame = ({
  children,
  isBare,
  serverProblem = null,
}: {
  readonly children: ReactNode;
  /** Signing in and the walk-through: never covered. */
  readonly isBare: boolean;
  /** The server's own problem while signed in (its configuration): said instead of the rest. */
  readonly serverProblem?: null | ServerProblem;
}) => {
  const { isCovered, message, problem } = useSyncPresentation(isBare, serverProblem);
  return (
    <View className="flex-1 bg-app">
      {/* Out of the page while covered (not drawn, not read), yet mounted. */}
      <View className="flex-1" style={isCovered ? HIDDEN : undefined}>
        {children}
      </View>
      {isCovered ? <FirstSyncPlaceholder /> : null}
      {message === null ? null : <SyncStrip message={message} problem={problem} />}
    </View>
  );
};
