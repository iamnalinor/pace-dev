import { Text, View } from "react-native";

import type { TaskTag, TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { ProgressBar } from "#app/ui/progress-bar.tsx";
import { formatDuration } from "@pace/core";

const tagKey = (tag: TaskTag) => {
  switch (tag.kind) {
    case "importance": {
      return `importance.${tag.importance}` as const;
    }
    case "status": {
      return `status.${tag.status}` as const;
    }
    case "submission": {
      return `submission.${tag.submission}` as const;
    }
  }
};

const Stat = ({
  label,
  note,
  value,
}: {
  readonly label: string;
  readonly note?: string;
  readonly value: string;
}) => (
  <View className="flex-1 gap-0.5">
    <Text className="font-sans text-[11px] text-muted">{label}</Text>
    <Text className="font-mono text-[15px] text-fg">{value}</Text>
    {note === undefined ? null : <Text className="font-sans text-[11px] text-faint">{note}</Text>}
  </View>
);

const PERCENT = 100;

/** Title, ticket and tags; the stats card (due, work left, tracked) and the window bar. */
export const TaskSummary = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const viewer = useViewer();
  const { stats } = view;
  const due =
    stats.dueAt === null
      ? t("task.noDue")
      : zonedText({ at: stats.dueAt, mode: "due", tz: stats.dueTz ?? viewer.deviceTz }, viewer);
  return (
    <View className="gap-4 px-5">
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="font-sans text-[26px] font-semibold tracking-tight text-fg"
        >
          {view.title}
        </Text>
        {view.ticket === null ? null : (
          <Text className="font-mono text-[12px] text-muted">{view.ticket}</Text>
        )}
        <View className="flex-row flex-wrap gap-1.5">
          {view.tags.map((tag) => (
            <Text
              className={cx(
                "rounded-sm bg-raised px-2 py-1 font-sans text-[11px]",
                tag.kind === "importance" ? "font-medium text-fg" : "text-fg2",
              )}
              key={tag.kind}
            >
              {t(tagKey(tag))}
            </Text>
          ))}
        </View>
      </View>
      <View className="flex-row gap-3 rounded-xl border border-line bg-surface p-3.5">
        <Stat label={t("task.due")} value={due} />
        <Stat
          label={t("task.workLeft")}
          note={t("task.estimate", {
            duration: formatDuration(stats.estimateMinutes, viewer.language),
          })}
          value={formatDuration(stats.workLeftMinutes, viewer.language)}
        />
        <Stat
          label={t("task.tracked")}
          value={formatDuration(stats.trackedMinutes, viewer.language)}
        />
      </View>
      {stats.windowElapsed === null ? null : (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-x-1.5">
            {stats.startAt === null ? null : (
              <Text className="font-sans text-[12px] text-muted">
                {`${t("task.issued", {
                  when: zonedText(
                    { at: stats.startAt, mode: "due", tz: stats.startTz ?? viewer.deviceTz },
                    viewer,
                  ),
                })} ·`}
              </Text>
            )}
            <Text className="font-sans text-[12px] text-muted">
              {t("task.windowGone", { percent: Math.round(stats.windowElapsed * PERCENT) })}
            </Text>
          </View>
          <ProgressBar
            label={t("task.windowGone", { percent: Math.round(stats.windowElapsed * PERCENT) })}
            marker={null}
            value={stats.windowElapsed}
          />
        </View>
      )}
    </View>
  );
};
