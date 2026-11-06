import type { ReactNode } from "react";

import { View } from "react-native";

import type { TaskTag, TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Group } from "#app/ui/group.tsx";
import { STATUS_HUES, type TagColor } from "#app/ui/hue.ts";
import { Icon } from "#app/ui/icon.tsx";
import { Link } from "#app/ui/link.tsx";
import { Dot, Tag } from "#app/ui/tag.tsx";
import { Text } from "#app/ui/text.tsx";
import { describeRepeatRule, formatDuration, presetLabel } from "@pace/core";

/** A long address cut in its middle: the host stays at the start, the end of the path at the end. */
const LINK_HEAD = 24;
const LINK_TAIL = 10;
const middleCut = (url: string): string => {
  const bare = url.replace(/^https?:\/\//u, "");
  return bare.length <= LINK_HEAD + LINK_TAIL + 1
    ? bare
    : `${bare.slice(0, LINK_HEAD)}…${bare.slice(-LINK_TAIL)}`;
};

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

/** Only a status under way is coloured (indigo); every other tag is neutral. */
const tagColor = (tag: TaskTag): null | TagColor =>
  tag.kind === "status" ? STATUS_HUES[tag.status] : null;

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
    <Text role="footnote" tone="secondary">
      {label}
    </Text>
    <Text role="numeric.value">{value}</Text>
    {note === undefined ? null : (
      <Text role="footnote" tone="secondary">
        {note}
      </Text>
    )}
  </View>
);

/** One row of the stats group: two figures side by side (2×2 at 390 and in the inspector). */
const StatRow = ({ children }: { readonly children: ReactNode }) => (
  <View className="flex-row gap-3 px-row-x py-3">{children}</View>
);

/**
One line of the task's kind (F-COL-04): the category's dot and name, the status as a tag (in
progress is the one coloured status), the importance when it is not Normal, and how it is
submitted. Tokens drop from the right when the line is full; the accessibility label has them all.
*/
const MetaTokens = ({
  category,
  tags,
}: {
  readonly category: TaskViewModel["category"];
  readonly tags: TaskViewModel["tags"];
}) => {
  const t = useT();
  const { language } = useViewer();
  const name = presetLabel(category, language);
  const words = tags
    .filter((tag) => !(tag.kind === "importance" && tag.importance === "normal"))
    .map((tag) => ({ hue: tagColor(tag), key: tag.kind, text: t(tagKey(tag)), tag }));
  return (
    <View
      accessibilityLabel={[name, ...words.map((word) => word.text)].join(", ")}
      accessible
      className="h-5 flex-row items-center gap-2 overflow-hidden"
      testID="task-meta"
    >
      <Dot hue={category.color} />
      <Text policy="truncate" role="footnote" tone="secondary">
        {name}
      </Text>
      {words.map((word) =>
        word.tag.kind === "importance" ? (
          <Text className="shrink-0" key={word.key} role="footnote" tone="secondary">
            {word.text}
          </Text>
        ) : (
          <Tag hue={word.hue} key={word.key}>
            {word.text}
          </Tag>
        ),
      )}
    </View>
  );
};

/** The link on one line, its middle cut (the host and the end stay): a real link with the full URL. */
const TaskLinkRow = ({ url }: { readonly url: string }) => (
  <Link
    className="min-h-hit-web flex-row items-center gap-1 self-start"
    href={url}
    label={`${url} ↗`}
  >
    <Text policy="truncate" role="footnote" tone="accent">
      {middleCut(url)}
    </Text>
    <Icon name="external-link" size="inline" tone="accent" />
  </Link>
);

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
    <StatRow>
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
    </StatRow>
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
    <View className="gap-3">
      <View className="gap-2 px-gutter">
        <Text level={1} role="title1">
          {view.title}
        </Text>
        <MetaTokens category={view.category} tags={view.tags} />
        {view.link === null ? null : <TaskLinkRow url={view.link.url} />}
      </View>
      <Group>
        <StatRow>
          <Stat label={t("task.start")} value={start} />
          <Stat label={t("task.due")} value={due} />
        </StatRow>
        <RepeatAndFinal stats={stats} />
        <StatRow>
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
        </StatRow>
      </Group>
    </View>
  );
};
