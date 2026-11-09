import { View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { cx } from "#app/ui/cx.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { HueTile } from "#app/ui/tag.tsx";
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

/**
Line 2, under the name: the time so far and the Expect. Beside the name the time took the row
(«Пош… 2 ч 02 мин [Стоп]»), so it sits under it, and the name keeps the width up to Stop.
*/
const RunningTime = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row items-baseline gap-2">
      <Text role="numeric.value">{formatDuration(running.minutes, language)}</Text>
      {running.expectMinutes === null ? null : (
        <Text policy="truncate" role="footnote" tone="secondary">
          {t("time.expectOf", { duration: formatDuration(running.expectMinutes, language) })}
        </Text>
      )}
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

/**
An alongside row's Stop: the main Stop's filled square on the same `fill.2`, without the word, named
«Стоп: …» (its tooltip says so). An outlined square alone at a row's end read as an unchecked
checkbox (design review 2 N1).
*/
const StopIcon = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  return (
    <IconButton
      haptic="tick"
      icon="square"
      isFilled
      label={`${t("time.stop")}: ${running.label}`}
      onPress={() => {
        void run(actions.stopActivity({ activityId: running.activityId }));
      }}
      tonal
    />
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
    <View className="flex-row items-center gap-x-3">
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
An activity running alongside the main one (spec §5.1 fold step 1): one compact row under the main
card's line, led by its category's tile (owner 2026-11-08: a running activity in a row leads with a
`HueTile`), its name (the row's width up to the time), the time so far and Stop as an icon; no
line of its own, no second card (design review B2). «параллельно» is not drawn (it left the name one
letter at 390): the row's place in the card says it, and its name says it to a screen reader.
*/
const AlongsideRow = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row items-center gap-3" testID="running-alongside">
      <HueTile hue={running.color} icon="timer" />
      <Text
        accessibilityLabel={`${running.label}, ${t("time.alongsideTag")}`}
        className="flex-1"
        policy="truncate"
        role="body"
      >
        {running.label}
      </Text>
      <Text role="numeric.value" tone="secondary">
        {formatDuration(running.minutes, language)}
      </Text>
      <StopIcon running={running} />
    </View>
  );
};

const NONE_ALONGSIDE: readonly RunningView[] = [];

/**
One running activity (spec §4.3.8, §5.1): its category's tile; its name (cut before Stop, never
under it) over the time so far and the Expect; Stop; past twice the Expect the question with
"Yes, still"; the ink line; and what runs alongside as compact rows. Compact so two activities, the
folded field and the tiles stay within the 40 % budget with the nav bar at 390 × 844 (docs/design.md,
2026-11-10). Not a live region: the ticking time is silent, and the bar announces a start, a stop
and "past expected" once each (F-A11Y-10).
*/
export const RunningCard = ({
  alongside = NONE_ALONGSIDE,
  running,
}: {
  readonly alongside?: readonly RunningView[];
  readonly running: RunningView;
}) => (
  <View className="gap-1 rounded-lg bg-cell px-3 py-2" testID="running-card">
    <View className="flex-row items-center gap-3">
      <HueTile hue={running.color} icon="timer" />
      {/* The name's column takes the row up to Stop; the name itself is no `flex-1` inside a
      column, where a zero basis would beat its height (bug-lessons 160). */}
      <View className="min-w-0 flex-1">
        <Text policy="truncate" role="headline">
          {running.label}
        </Text>
        <RunningTime running={running} />
      </View>
      <StopButton running={running} />
    </View>
    <StillGoing running={running} />
    <InkLine expectMinutes={running.expectMinutes} minutes={running.minutes} />
    {alongside.map((item) => (
      <View className="border-t border-separator" key={item.activityId}>
        <AlongsideRow running={item} />
      </View>
    ))}
  </View>
);
