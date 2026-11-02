import { Square } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { ColorTag, fillClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { PulseDot } from "#app/ui/pulse-dot.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { PACE_STATUS_TEXT, type RunningView } from "@pace/client";
import { formatDuration } from "@pace/core";

const percent = (share: number): `${number}%` => `${Math.round(share * 100)}%`;

/** The running activity's line: the label, the time and the Expect. */
const RunningMeta = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <PulseDot className={fillClass(running.color)} />
      <ColorTag color={running.color}>{running.label}</ColorTag>
      <Text className="font-sans text-footnote tabular-nums text-label-primary">
        {formatDuration(running.minutes, language)}
      </Text>
      {running.expectMinutes === null ? null : (
        <Text className="font-sans text-caption font-normal text-label-tertiary">
          {t("time.expectOf", { duration: formatDuration(running.expectMinutes, language) })}
        </Text>
      )}
      {running.isAlongside ? (
        <Text className="font-sans text-caption font-normal text-label-tertiary">
          {t("time.alongsideTag")}
        </Text>
      ) : null}
    </View>
  );
};

/** One running activity: what, how long, its progress to the Expect; "Yes, still" and Stop. */
export const RunningRow = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const isLong = running.status === "long";
  const statusKey = PACE_STATUS_TEXT[running.status];
  return (
    <View className="flex-row items-center gap-2">
      <View accessibilityLiveRegion="polite" className="flex-1 gap-1">
        <RunningMeta running={running} />
        {/* Its own line, so the bar does not move as the minutes grow. */}
        {statusKey === null ? null : (
          <Text className="font-sans text-caption text-warn">{t(statusKey)}</Text>
        )}
        {running.share === null ? null : (
          <View className="h-1 overflow-hidden rounded-pill bg-fill-4">
            <View
              className={cx("h-full rounded-pill", isLong ? "bg-warn" : fillClass(running.color))}
              style={{ width: percent(running.share) }}
            />
          </View>
        )}
      </View>
      {isLong ? (
        <Pressable
          accessibilityRole="button"
          className="h-hit-web justify-center rounded-lg border border-outline px-3 active:opacity-70"
          onPress={() => {
            // Still going: the next ask moves on as far again; the Expect stays what it was.
            void run(actions.stillGoing(running.activityId));
          }}
        >
          <Text className="font-sans text-footnote text-label-primary">{t("time.stillYes")}</Text>
        </Pressable>
      ) : null}
      <StopButton running={running} />
    </View>
  );
};

/** Stop for this one activity (the main one or one alongside), named after it. */
const StopButton = ({ running }: { readonly running: RunningView }) => {
  const t = useT();
  const { actions } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  return (
    <Pressable
      accessibilityLabel={`${t("time.stop")}: ${running.label}`}
      accessibilityRole="button"
      className="h-hit-web flex-row items-center gap-2 rounded-lg border border-outline px-3 active:opacity-70"
      hitSlop={6}
      onPress={() => {
        void run(actions.stopActivity({ activityId: running.activityId }));
      }}
    >
      <Square color={palette["label.primary"]} size={14} />
      <Text className="font-sans text-footnote text-label-primary">{t("time.stop")}</Text>
    </Pressable>
  );
};
