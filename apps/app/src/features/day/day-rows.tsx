import { View } from "react-native";

import type { DayEntry, DayRowProps } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { WhereSatLine } from "#app/shared/where-sat-line.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ListRow } from "#app/ui/list-row.tsx";
import { Pressable } from "#app/ui/pressable.tsx";
import { Text } from "#app/ui/text.tsx";
import { formatDuration, type Gap, type Language, type SatRow } from "@pace/core";

import type { SheetTarget } from "./activity-sheet.tsx";
import type { DayPhone } from "./use-day-phone.ts";

import * as Phone from "./phone-section.tsx";

/** "of ~30m", when the block has an Expect. */
const targetText = (
  row: DayRowProps["row"],
  t: ReturnType<typeof useT>,
  language: Language,
): null | string =>
  row.expectMinutes === null
    ? null
    : t("time.expectOf", { duration: formatDuration(row.expectMinutes, language) });

/** "14:06 – 14:40". */
const rangeText = (startAt: string, end: string, zone: string): string =>
  `${clockTime(startAt, zone)} – ${end}`;

/** The time column of a row: its range, in the footnote's tabular figures. */
const TimeColumn = ({ text }: { readonly text: string }) => (
  <View className={Phone.TIME_WIDTH}>
    <Text numeric role="caption" tone="secondary">
      {text}
    </Text>
  </View>
);

/** The duration against its Expect or Limit, trailing a block. */
const Duration = ({ row }: { readonly row: DayRowProps["row"] }) => {
  const t = useT();
  const { language } = useViewer();
  const target = targetText(row, t, language);
  return (
    <View className="items-end">
      <Text numeric role="footnote" tone={row.isRunning ? "accent" : "primary"}>
        {formatDuration(row.minutes, language)}
      </Text>
      {target === null ? null : (
        <Text role="caption2" tone="tertiary">
          {target}
        </Text>
      )}
    </View>
  );
};

/**
A block of the day: "14:06 – 14:40" (or "– now" while it runs), its label (the category when the
label only repeats it), the category's name and the duration against its Expect or Limit. The whole
row opens the editor, so it carries no pencil; its task is linked on the line under it.
*/
export const ActivityRow = ({
  isSelected = false,
  onEdit,
  row,
  satRows,
  zone,
}: DayRowProps & { readonly isSelected?: boolean; readonly satRows: readonly SatRow[] }) => {
  const t = useT();
  const isWide = useIsWide();
  const category = t(`category.${row.category}`);
  const range = rangeText(
    row.startAt,
    row.isRunning ? t("day.now") : clockTime(row.endAt, zone),
    zone,
  );
  return (
    <ListRow
      leading={<TimeColumn text={range} />}
      meta={
        <>
          {row.showsLabel ? (
            <Text role="footnote" tone="secondary">
              {category}
            </Text>
          ) : null}
          {isWide ? <WhereSatLine compact rows={satRows} /> : null}
        </>
      }
      onPress={onEdit}
      selected={isSelected}
      title={row.showsLabel ? row.label : category}
      titleLines={2}
      titleLook={{ className: "font-semibold" }}
      trailing={<Duration row={row} />}
    />
  );
};

/**
The block's task, a link on its own line under the row, lined up with the block's words: inside
the row's button it would be a control within a control, which screen readers skip. Its words
come from the view-model ("Open task" under a block already named after the task).
*/
const TaskLine = ({ row }: { readonly row: DayRowProps["row"] }) => {
  const t = useT();
  const openTask = useOpenTask();
  const link = row.taskLink;
  if (link === null) {
    return null;
  }
  // Named after the task for a screen reader: a list of "Open task" links says nothing about
  // where each goes. Under a block named after the task, its label is that title (as stored).
  const title = "title" in link.text ? link.text.title : row.label;
  return (
    <View className="flex-row pb-2">
      <Pressable
        label={t("day.openTaskNamed", { title })}
        onPress={() => {
          openTask(link.id);
        }}
        role="link"
      >
        <Text className="underline" lines={1} policy="clamp" role="caption" tone="secondary">
          {"title" in link.text ? link.text.title : t(link.text.key)}
        </Text>
      </Pressable>
    </View>
  );
};

/**
Time with nothing logged: a quiet row in the same rhythm, "11:00 – 13:00 · 2h not logged", with
Log at its end. The whole row opens the editor to log it.
*/
const GapRow = ({
  gap,
  isSelected,
  onLog,
  zone,
}: {
  readonly gap: Gap;
  readonly isSelected: boolean;
  readonly onLog: () => void;
  readonly zone: string;
}) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <ListRow
      leading={<TimeColumn text={rangeText(gap.startAt, clockTime(gap.endAt, zone), zone)} />}
      onPress={onLog}
      selected={isSelected}
      title={t("day.gap", { duration: formatDuration(gap.minutes, language) })}
      titleLines={2}
      titleLook={{ tone: "secondary" }}
      trailing={
        <Text role="subhead" tone="accent">
          {t("day.logGap")}
        </Text>
      }
    />
  );
};

/** The timeline's last row: a quiet "+ Log past activity", the row action of the list. */
export const LogPastRow = ({ onPress }: { readonly onPress: () => void }) => {
  const t = useT();
  return (
    <ListRow
      leading={<Icon name="plus" size="control" tone="secondary" />}
      onPress={onPress}
      title={t("day.logPast")}
      titleLines={2}
      titleLook={{ tone: "secondary" }}
    />
  );
};

/** Where a block's time went on the other devices. */
export type SatOf = (startAt: string, endAt: string) => readonly SatRow[];

/** Whether an entry is the one open in the editor (the inspector marks it). */
const isTarget = (entry: DayEntry, selected: null | SheetTarget): boolean =>
  selected !== null &&
  (entry.kind === "gap"
    ? selected.kind === "log" && selected.startAt === entry.gap.startAt
    : selected.kind === "edit" && selected.activityId === entry.row.activityId);

/** One line of the day; a tap opens its editor (edit the block, or log the gap). */
export const EntryRow = ({
  entry,
  onOpen,
  phone,
  sat,
  selected,
  zone,
}: {
  readonly entry: DayEntry;
  readonly zone: string;
  readonly phone: DayPhone;
  readonly sat: SatOf;
  readonly selected: null | SheetTarget;
  readonly onOpen: (target: SheetTarget) => void;
}) => {
  const isWide = useIsWide();
  const open = (): void => {
    onOpen(entry.target);
  };
  const isSelected = isTarget(entry, selected);
  if (entry.kind === "gap") {
    return <GapRow gap={entry.gap} isSelected={isSelected} onLog={open} zone={zone} />;
  }
  return (
    <>
      <ActivityRow
        isSelected={isSelected}
        onEdit={open}
        row={entry.row}
        satRows={sat(entry.row.startAt, entry.row.endAt)}
        zone={zone}
      />
      <Phone.UnderBlock>
        <TaskLine row={entry.row} />
        <Phone.UsageLine apps={phone.usageIn(entry.row.startAt, entry.row.endAt)} />
        {isWide ? null : <WhereSatLine rows={sat(entry.row.startAt, entry.row.endAt)} />}
        <Phone.EndedAtPrompt phone={phone} row={entry.row} zone={zone} />
      </Phone.UnderBlock>
    </>
  );
};
