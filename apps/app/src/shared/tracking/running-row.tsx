import { Square } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { ColorTag, PROJECT_FILL } from "#app/ui/color.tsx";
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
      <PulseDot className={PROJECT_FILL[running.color]} />
      <ColorTag color={running.color}>{running.label}</ColorTag>
      <Text className="font-sans text-[13px] tabular-nums text-fg">
        {formatDuration(running.minutes, language)}
      </Text>
      {running.expectMinutes === null ? null : (
        <Text className="font-sans text-[12px] text-muted">
          {t("time.expectOf", { duration: formatDuration(running.expectMinutes, language) })}
        </Text>
      )}
      {running.isAlongside ? (
        <Text className="font-sans text-[12px] text-muted">{t("time.alongsideTag")}</Text>
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
          <Text className="font-sans text-[12px] font-medium text-warn">{t(statusKey)}</Text>
        )}
        {running.share === null ? null : (
          <View className="h-1 overflow-hidden rounded-full bg-track">
            <View
              className={cx(
                "h-full rounded-full",
                isLong ? "bg-warn" : PROJECT_FILL[running.color],
              )}
              style={{ width: percent(running.share) }}
            />
          </View>
        )}
      </View>
      {isLong ? (
        <Pressable
          accessibilityRole="button"
          className="h-11 justify-center rounded-lg border border-line px-3 active:opacity-70"
          onPress={() => {
            // Still going: the next ask moves on as far again; the Expect stays what it was.
            void run(actions.stillGoing(running.activityId));
          }}
        >
          <Text className="font-sans text-[13px] text-fg">{t("time.stillYes")}</Text>
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
      className="h-11 flex-row items-center gap-1.5 rounded-lg border border-line px-3 active:opacity-70"
      hitSlop={6}
      onPress={() => {
        void run(actions.stopActivity({ activityId: running.activityId }));
      }}
    >
      <Square color={palette.fg} size={14} />
      <Text className="font-sans text-[13px] text-fg">{t("time.stop")}</Text>
    </Pressable>
  );
};
