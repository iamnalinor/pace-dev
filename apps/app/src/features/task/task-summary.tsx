import { Linking, Text, View } from "react-native";

import type { TaskTag, TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import {
  IMPORTANCE_HUES,
  inkClass,
  STATUS_HUES,
  type TagColor,
  washClass,
} from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { describeRepeatRule, formatDuration, presetLabel } from "@pace/core";

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

/** Importance and a status under way are colored; the rest stays neutral. */
const tagColor = (tag: TaskTag): null | TagColor => {
  switch (tag.kind) {
    case "importance": {
      return IMPORTANCE_HUES[tag.importance];
    }
    case "status": {
      return STATUS_HUES[tag.status];
    }
    case "outcome":
    case "submission": {
      return null;
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
  <View
    accessibilityLabel={label}
    accessibilityValue={{ text: value }}
    accessible
    className="flex-1 gap-0.5"
  >
    <Text className="font-sans text-caption2 font-normal text-label-tertiary">{label}</Text>
    <Text className="font-sans text-callout tabular-nums text-label-primary">{value}</Text>
    {note === undefined ? null : (
      <Text className="font-sans text-caption2 font-normal text-label-tertiary">{note}</Text>
    )}
  </View>
);

/**
The category in its colour (as the task's rows show it), importance and status in theirs,
submission and outcome neutral, as small tags.
*/
const TaskTags = ({
  category,
  tags,
}: {
  readonly category: TaskViewModel["category"];
  readonly tags: TaskViewModel["tags"];
}) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row flex-wrap gap-2">
      <View className={cx("rounded-sm px-2 py-1", washClass(category.color))}>
        <Text className={cx("font-sans text-caption2 font-medium", inkClass(category.color))}>
          {presetLabel(category, language)}
        </Text>
      </View>
      {tags.map((tag) => {
        const color = tagColor(tag);
        return (
          <View
            className={cx(
              "flex-row items-center gap-2 rounded-sm px-2 py-1",
              color === null ? "bg-fill-4" : washClass(color),
            )}
            key={tag.kind}
          >
            <Text
              className={cx(
                "font-sans text-caption2 font-normal",
                color === null ? "text-label-secondary" : cx("font-medium", inkClass(color)),
              )}
            >
              {t(tagKey(tag))}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

/**
How the task repeats and the hard end of a two-stage deadline, the latter under Due; the row is
left out for a one-off task with one deadline.
*/
const RepeatAndFinal = ({ stats }: { readonly stats: TaskViewModel["stats"] }) => {
  const t = useT();
  const viewer = useViewer();
  const { finalDue, repeat } = stats;
  if (repeat === null && finalDue === null) {
    return null;
  }
  return (
    <View className="flex-row gap-3">
      {repeat === null ? (
        <View className="flex-1" />
      ) : (
        <Stat
          label={t("task.repeats")}
          value={describeRepeatRule(repeat, { ...viewer, tz: viewer.deviceTz })}
        />
      )}
      {finalDue === null ? (
        <View className="flex-1" />
      ) : (
        <Stat label={t("task.finalDue")} value={zonedText({ ...finalDue, mode: "due" }, viewer)} />
      )}
    </View>
  );
};

/** Title, link and tags; the stats card: start, due, repeat, final deadline, work left, tracked. */
export const TaskSummary = ({
  view,
  workLeftMinutes = view.stats.workLeftMinutes,
}: {
  readonly view: TaskViewModel;
  /** The work left at the progress being dragged, before it is saved. */
  readonly workLeftMinutes?: number;
}) => {
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
        <Text accessibilityRole="header" className="font-sans text-title1 text-label-primary">
          {view.title}
        </Text>
        {view.link === null ? null : (
          <Text
            accessibilityRole="link"
            className="font-sans text-caption font-normal text-label-secondary"
            onPress={() => {
              void Linking.openURL(view.link?.url ?? "");
            }}
          >
            {view.link.url} ↗
          </Text>
        )}
        <TaskTags category={view.category} tags={view.tags} />
      </View>
      <View className="gap-3 rounded-xl border border-separator bg-cell p-4">
        <View className="flex-row gap-3">
          <Stat label={t("task.start")} value={start} />
          <Stat label={t("task.due")} value={due} />
        </View>
        <RepeatAndFinal stats={stats} />
        <View className="flex-row gap-3">
          <Stat
            label={t("task.workLeft")}
            note={t("task.estimate", {
              duration: formatDuration(stats.estimateMinutes, viewer.language),
            })}
            value={formatDuration(workLeftMinutes, viewer.language)}
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
