import { Linking, Text, View } from "react-native";

import type { TaskTag, TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { inkClass, washClass } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { formatDuration, IMPORTANCE_COLORS } from "@pace/core";

const tagKey = (tag: TaskTag) => {
  switch (tag.kind) {
    case "importance": {
      return `importance.${tag.importance}` as const;
    }
    case "outcome": {
      return `outcome.${tag.outcome}` as const;
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
    <Text className="font-sans text-[15px] tabular-nums text-fg">{value}</Text>
    {note === undefined ? null : <Text className="font-sans text-[11px] text-faint">{note}</Text>}
  </View>
);

/** Importance (with its colour), status and submission as small tags. */
const TaskTags = ({ tags }: { readonly tags: TaskViewModel["tags"] }) => {
  const t = useT();
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {tags.map((tag) => (
        <View
          className={cx(
            "flex-row items-center gap-1.5 rounded-sm px-2 py-1",
            tag.kind === "importance" ? washClass(IMPORTANCE_COLORS[tag.importance]) : "bg-raised",
          )}
          key={tag.kind}
        >
          <Text
            className={cx(
              "font-sans text-[11px]",
              tag.kind === "importance"
                ? cx("font-medium", inkClass(IMPORTANCE_COLORS[tag.importance]))
                : "text-fg2",
            )}
          >
            {t(tagKey(tag))}
          </Text>
        </View>
      ))}
    </View>
  );
};

/** Title, link and tags; the stats card: start, due, work left, tracked. */
export const TaskSummary = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const viewer = useViewer();
  const { stats } = view;
  const due =
    stats.dueAt === null
      ? t("task.noDue")
      : zonedText({ at: stats.dueAt, mode: "due", tz: stats.dueTz ?? viewer.deviceTz }, viewer);
  const start = zonedText(
    { at: stats.startAt, mode: "due", tz: stats.startTz ?? viewer.deviceTz },
    viewer,
  );
  return (
    <View className="gap-4 px-5">
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="font-sans text-[26px] font-semibold tracking-tight text-fg"
        >
          {view.title}
        </Text>
        {view.link === null ? null : (
          <Text
            accessibilityRole="link"
            className="font-sans text-[12px] text-fg2"
            onPress={() => {
              void Linking.openURL(view.link?.url ?? "");
            }}
          >
            {view.link.host} ↗
          </Text>
        )}
        <TaskTags tags={view.tags} />
      </View>
      <View className="gap-3 rounded-xl border border-line bg-surface p-3.5">
        <View className="flex-row gap-3">
          <Stat label={t("task.start")} value={start} />
          <Stat label={t("task.due")} value={due} />
        </View>
        <View className="flex-row gap-3">
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
      </View>
    </View>
  );
};
