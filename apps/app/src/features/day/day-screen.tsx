import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { DayEntry, DayRowProps } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { IS_PHONE } from "#app/platform/device.ts";
import { ScreenTimeSection } from "#app/shared/activity-usage.tsx";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useWhereSat } from "#app/shared/use-where-sat.ts";
import { WhereSatLine } from "#app/shared/where-sat-line.tsx";
import { ColorTag } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { EmptyText, FirstSyncBody } from "#app/ui/empty-state.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { OverlayPresence } from "#app/ui/overlay-presence.tsx";
import { RowList } from "#app/ui/row-list.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { Text as KitText } from "#app/ui/text.tsx";
import { useUsageRead } from "@pace/client/react";
import {
  addDaysIn,
  formatDuration,
  formatEyebrow,
  type Gap,
  type Language,
  type SatRow,
} from "@pace/core";

import { ActivitySheet, type SheetTarget } from "./activity-sheet.tsx";
import { DayNav } from "./day-nav.tsx";
import { Totals } from "./day-totals.tsx";
import * as Phone from "./phone-section.tsx";
import { type DayPhone, useDayPhone } from "./use-day-phone.ts";

/** "of ~30m", when the block has an Expect. */
const targetText = (
  row: DayRowProps["row"],
  t: ReturnType<typeof useT>,
  language: Language,
): null | string =>
  row.expectMinutes === null
    ? null
    : t("time.expectOf", { duration: formatDuration(row.expectMinutes, language) });

/**
One line of the day's rhythm: the same height and the same time column for a block, a gap and
"Log past activity", so the list reads as one timeline.
*/
const ROW = "min-h-row flex-row items-center gap-3 py-2 active:opacity-70";
const TIME_COLUMN = cx(Phone.TIME_WIDTH, "font-sans text-caption font-normal tabular-nums");
const LINE = "font-sans text-subhead font-normal";

/** "14:06 – 14:40". */
const rangeText = (startAt: string, end: string, zone: string): string =>
  `${clockTime(startAt, zone)} – ${end}`;

/**
A block of the day: "14:06 – 14:40" (or "– now" while it runs), the category tag and the
label when it says more than the tag, then the duration against its Expect or Limit and a
pencil. The whole row opens the edit sheet; its task is linked on the line under it.
*/
export const ActivityRow = ({
  onEdit,
  row,
  satRows,
  zone,
}: DayRowProps & { readonly satRows: readonly SatRow[] }) => {
  const t = useT();
  const { language } = useViewer();
  const isWide = useIsWide();
  const range = rangeText(
    row.startAt,
    row.isRunning ? t("day.now") : clockTime(row.endAt, zone),
    zone,
  );
  const target = targetText(row, t, language);
  return (
    <Pressable
      accessibilityHint={t("day.edit", { label: row.label })}
      accessibilityRole="button"
      className={ROW}
      onPress={onEdit}
    >
      <Text className={cx(TIME_COLUMN, "text-label-secondary")}>{range}</Text>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <ColorTag color={row.color}>{t(`category.${row.category}`)}</ColorTag>
          {row.showsLabel ? (
            <KitText policy="truncate" role="subhead">
              {row.label}
            </KitText>
          ) : null}
          {isWide ? <WhereSatLine compact rows={satRows} /> : null}
        </View>
      </View>
      <View className="items-end">
        <Text
          className={cx(
            "font-sans text-footnote tabular-nums",
            row.isRunning ? "text-accent-text" : "text-label-primary",
          )}
        >
          {formatDuration(row.minutes, language)}
        </Text>
        {target === null ? null : (
          <Text className="font-sans text-caption2 font-normal text-label-tertiary">{target}</Text>
        )}
      </View>
      <Icon name="pencil" size="inline" />
    </Pressable>
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
      <Text
        accessibilityLabel={t("day.openTaskNamed", { title })}
        accessibilityRole="link"
        className="min-h-6 shrink py-1 font-sans text-caption font-normal text-label-secondary underline"
        numberOfLines={1}
        onPress={() => {
          openTask(link.id);
        }}
      >
        {"title" in link.text ? link.text.title : t(link.text.key)}
      </Text>
    </View>
  );
};

/**
Time with nothing logged: a quiet row in the same rhythm, "11:00 – 13:00 · 2h not logged", and
Log where a block has its duration. The whole row opens the sheet to log it.
*/
const GapRow = ({
  gap,
  onLog,
  zone,
}: {
  readonly gap: Gap;
  readonly onLog: () => void;
  readonly zone: string;
}) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <Pressable accessibilityRole="button" className={ROW} onPress={onLog}>
      <Text className={cx(TIME_COLUMN, "text-label-secondary")}>
        {rangeText(gap.startAt, clockTime(gap.endAt, zone), zone)}
      </Text>
      <Text className="flex-1 font-sans text-footnote text-label-secondary">
        {t("day.gap", { duration: formatDuration(gap.minutes, language) })}
      </Text>
      <Text className="font-sans text-footnote font-medium text-accent-text">
        {t("day.logGap")}
      </Text>
    </Pressable>
  );
};

/** The timeline's last row: a quiet "+ Log past activity" in the same rhythm. */
const LogPastRow = ({
  hasDivider,
  onPress,
}: {
  readonly hasDivider: boolean;
  readonly onPress: () => void;
}) => {
  const t = useT();
  return (
    <View className="px-5">
      <Pressable
        accessibilityRole="button"
        className={cx(ROW, hasDivider && "border-t border-separator")}
        onPress={onPress}
      >
        <Icon name="plus" size="inline" />
        <Text className={cx(LINE, "text-label-secondary")}>{t("day.logPast")}</Text>
      </Pressable>
    </View>
  );
};

/** Where a block's time went on the other devices. */
type SatOf = (startAt: string, endAt: string) => readonly SatRow[];

/** One line of the day; a tap opens its sheet (edit the block, or log the gap). */
const EntryRow = ({
  entry,
  onOpen,
  phone,
  sat,
  zone,
}: {
  readonly entry: DayEntry;
  readonly zone: string;
  readonly phone: DayPhone;
  readonly sat: SatOf;
  readonly onOpen: (target: SheetTarget) => void;
}) => {
  const isWide = useIsWide();
  const open = (): void => {
    onOpen(entry.target);
  };
  if (entry.kind === "gap") {
    return <GapRow gap={entry.gap} onLog={open} zone={zone} />;
  }
  return (
    <>
      <ActivityRow
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

/** The day's blocks and the gaps between them, in time order, a hairline between every two. */
const Entries = ({
  entries,
  onOpen,
  phone,
  sat,
  zone,
}: {
  readonly entries: readonly DayEntry[];
  readonly zone: string;
  readonly phone: DayPhone;
  readonly sat: SatOf;
  readonly onOpen: (target: SheetTarget) => void;
}) => (
  <RowList className="px-5">
    {entries.map((entry, index) => (
      <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT} key={entry.key} layout={ROW_LAYOUT}>
        {/* The hairline on a plain view: the web drops class names on animated ones. */}
        <View className={cx(index > 0 && "border-t border-separator")} testID="day-entry">
          <EntryRow entry={entry} onOpen={onOpen} phone={phone} sat={sat} zone={zone} />
        </View>
      </Animated.View>
    ))}
  </RowList>
);

/**
One day of the time ledger: totals per category, the timeline with its gaps, edits. Today it
has the time bar at its foot, where the thumb rests; another day is only looked back on.
*/
export const DayScreen = () => {
  const t = useT();
  const { api, hooks } = usePace();
  const { language } = useViewer();
  const [date, setDate] = useState<null | string>(null);
  const [sheet, setSheet] = useState<null | SheetTarget>(null);
  const closeSheet = (): void => {
    setSheet(null);
  };
  const day = hooks.useDay(date);
  const { now } = hooks.useClock();
  const phone = useDayPhone(day, now);
  // One read of the day's usage for every part that shows it (QA round 21 L5).
  const usageRead = useUsageRead(api, day.date, addDaysIn(day.date, 1, day.zone));
  const usage = usageRead.rows;
  const sat = useWhereSat(usage);
  const header = (
    <ScreenHeader
      period={<DayNav day={day} onDate={setDate} />}
      subtitle={formatEyebrow(day.date, day.zone, language)}
      title={t("day.title")}
      variant="top"
    />
  );
  return (
    <Screen header={header}>
      <FirstSyncBody>
        <Totals day={day} />
        {IS_PHONE && !phone.hasUsageAccess ? <Phone.UsageAccessHint /> : null}
        {day.entries.length === 0 ? (
          <EmptyText className={cx(LINE, "px-5 py-6 text-label-secondary")}>
            {t("day.empty")}
          </EmptyText>
        ) : (
          <Entries
            entries={day.entries}
            onOpen={setSheet}
            phone={phone}
            sat={sat}
            zone={day.zone}
          />
        )}
        <LogPastRow
          hasDivider={day.entries.length > 0}
          onPress={() => {
            setSheet(day.logTarget);
          }}
        />
        {IS_PHONE ? (
          <Phone.CalendarSection entries={day.entries} phone={phone} zone={day.zone} />
        ) : null}
        <ScreenTimeSection
          date={day.date}
          key={day.date}
          onRetry={usageRead.isFailed ? usageRead.retry : null}
          usage={usage}
          zone={day.zone}
        />
      </FirstSyncBody>
      <OverlayPresence value={sheet}>
        {(kept) => <ActivitySheet onClose={closeSheet} target={kept} zone={day.zone} />}
      </OverlayPresence>
    </Screen>
  );
};
