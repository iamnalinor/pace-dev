import { View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { cx } from "#app/ui/cx.ts";
import { Dot } from "#app/ui/tag.tsx";
import { Text } from "#app/ui/text.tsx";
import { PACE_STATUS_TEXT, type RunningView } from "@pace/client";
import { formatDuration } from "@pace/core";

import { inkLine } from "./ink-line.ts";

const percent = (share: number): `${number}%` => `${Math.round(share * 100)}%`;

/**
The ink line (spec §2 A): 2 px from the start to now in the accent, a red 1 px mark at the
expected length; past twice the Expect it is `status.warn`. It moves with the minute tick, never
continuously.
*/
export const InkLine = ({
  expectMinutes,
  minutes,
}: {
  readonly expectMinutes: null | number;
  readonly minutes: number;
}) => {
  const line = inkLine(minutes, expectMinutes);
  if (line === null) {
    return null;
  }
  return (
    <View className="relative h-0.5 rounded-pill bg-fill-4" testID="ink-line">
      <View
        className={cx("h-full rounded-pill", line.isPast ? "bg-warn" : "bg-accent")}
        style={{ width: percent(line.fill) }}
        testID="ink-fill"
      />
      <View
        className="absolute -inset-y-1 border-l border-danger"
        style={{ left: percent(line.mark) }}
        testID="ink-mark"
      />
    </View>
  );
};

/** Line 2: the time so far (the largest live number on Now), the Expect, and "alongside". */
const RunningTime = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-2">
      <Text role="numeric.live">{formatDuration(running.minutes, language)}</Text>
      {running.expectMinutes === null ? null : (
        <Text role="footnote" tone="secondary">
          {t("time.expectOf", { duration: formatDuration(running.expectMinutes, language) })}
        </Text>
      )}
      {running.isAlongside ? (
        <Text role="footnote" tone="secondary">
          {t("time.alongsideTag")}
        </Text>
      ) : null}
    </View>
  );
};

/** Stop for this one activity (the main one or one alongside), named after it. */
const StopButton = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <Button
      haptic="tick"
      icon="square"
      isIconFilled
      label={`${t("time.stop")}: ${running.label}`}
      onPress={() => {
        void run(actions.stopActivity({ activityId: running.activityId }));
      }}
      variant="secondary"
      width="hug"
    >
      {t("time.stop")}
    </Button>
  );
};

/** The past-expected line: the question in `status.warn`, and "Yes, still" under it. */
const StillGoing = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const statusKey = PACE_STATUS_TEXT[running.status];
  if (statusKey === null) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
      <Text role="footnote" tone="warn">
        {t(statusKey)}
      </Text>
      <Button
        onPress={() => {
          // Still going: the next ask moves on as far again; the Expect stays what it was.
          void run(actions.stillGoing(running.activityId));
        }}
        size="small"
        variant="secondary"
        width="hug"
      >
        {t("time.stillYes")}
      </Button>
    </View>
  );
};

/**
One running activity (spec §4.3.8): its category's dot and name (cut before Stop, never under it),
Stop; the time so far and the Expect; the ink line; and, past twice the Expect, the question with
"Yes, still". Not a live region: the ticking time is silent, and the bar announces a start, a stop
and "past expected" once each (F-A11Y-10).
*/
export const RunningCard = ({ running }: { readonly running: RunningView }) => (
  <View className="gap-3 rounded-lg bg-cell p-4" testID="running-card">
    <View className="flex-row items-center gap-3">
      <Dot hue={running.color} />
      <Text className="flex-1" policy="truncate" role="headline">
        {running.label}
      </Text>
      <StopButton running={running} />
    </View>
    <RunningTime running={running} />
    <InkLine expectMinutes={running.expectMinutes} minutes={running.minutes} />
    <StillGoing running={running} />
  </View>
);
