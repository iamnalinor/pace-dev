import { Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { DayEntry, DayModel, DayRowProps } from "@pace/client";

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
import { useIsWide } from "#app/ui/layout.ts";
import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { RowList } from "#app/ui/row-list.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
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
import {
  CalendarSection,
  EndedAtPrompt,
  SleepCard,
  UsageAccessHint,
  UsageLine,
} from "./phone-section.tsx";
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
const ROW = "min-h-14 flex-row items-center gap-3 py-2 active:opacity-70";
const TIME_COLUMN = "w-[104px] font-sans text-[12px] tabular-nums";

/** "14:06 – 14:40". */
const rangeText = (startAt: string, end: string, zone: string): string =>
  `${clockTime(startAt, zone)} – ${end}`;

/**
A block of the day: "14:06 – 14:40" (or "– now" while it runs), the category tag and the
label when it says more than the tag, then the duration against its Expect or Limit and a
pencil. The whole row opens the edit sheet; its task is linked on the line under it.
*/
const ActivityRow = ({
  onEdit,
  row,
  satRows,
  zone,
}: DayRowProps & { readonly satRows: readonly SatRow[] }) => {
  const t = useT();
  const { language } = useViewer();
  const { palette } = useTheme();
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
      <Text className={cx(TIME_COLUMN, "text-muted")}>{range}</Text>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <ColorTag color={row.color}>{t(`category.${row.category}`)}</ColorTag>
          {row.showsLabel ? (
            <Text className="font-sans text-[14px] font-medium text-fg" numberOfLines={1}>
              {row.label}
            </Text>
          ) : null}
          {isWide ? <WhereSatLine compact isIndented={false} rows={satRows} /> : null}
        </View>
      </View>
      <View className="items-end">
        <Text
          className={cx(
            "font-sans text-[13px] tabular-nums",
            row.isRunning ? "text-accentQuietText" : "text-fg",
          )}
        >
          {formatDuration(row.minutes, language)}
        </Text>
        {target === null ? null : (
          <Text className="font-sans text-[11px] text-muted">{target}</Text>
        )}
      </View>
      <Pencil color={palette.muted} size={16} strokeWidth={1.75} />
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
    <View className="flex-row pb-2 pl-[116px]">
      <Text
        accessibilityLabel={t("day.openTaskNamed", { title })}
        accessibilityRole="link"
        className="min-h-6 shrink py-1 font-sans text-[12px] text-fg2 underline"
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
      <Text className={cx(TIME_COLUMN, "text-muted")}>
        {rangeText(gap.startAt, clockTime(gap.endAt, zone), zone)}
      </Text>
      <Text className="flex-1 font-sans text-[13px] text-muted">
        {t("day.gap", { duration: formatDuration(gap.minutes, language) })}
      </Text>
      <Text className="font-sans text-[13px] font-medium text-accentQuietText">
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
  const { palette } = useTheme();
  return (
    <View className="px-5">
      <Pressable
        accessibilityRole="button"
        className={cx(ROW, hasDivider && "border-t border-line")}
        onPress={onPress}
      >
        <Plus color={palette.fg2} size={16} strokeWidth={1.75} />
        <Text className="font-sans text-[14px] text-fg2">{t("day.logPast")}</Text>
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
      <TaskLine row={entry.row} />
      <UsageLine apps={phone.usageIn(entry.row.startAt, entry.row.endAt)} />
      {isWide ? null : <WhereSatLine rows={sat(entry.row.startAt, entry.row.endAt)} />}
      <EndedAtPrompt phone={phone} row={entry.row} zone={zone} />
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
        <View className={cx(index > 0 && "border-t border-line")} testID="day-entry">
          <EntryRow entry={entry} onOpen={onOpen} phone={phone} sat={sat} zone={zone} />
        </View>
      </Animated.View>
    ))}
  </RowList>
);

/** The day's tracked time and its split by category. */
const Totals = ({ day }: { readonly day: DayModel }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="flex-row flex-wrap items-center gap-1.5 px-5 pb-3">
      <Text className="mr-1 font-sans text-[14px] text-fg">
        {t("day.tracked", { duration: formatDuration(day.trackedMinutes, language) })}
      </Text>
      {day.totals.map((total) => (
        <ColorTag color={total.color} key={total.category}>
          {t("day.total", {
            category: t(`category.${total.category}`),
            duration: formatDuration(total.minutes, language),
          })}
        </ColorTag>
      ))}
    </View>
  );
};

/**
One day of the time ledger: totals per category, the timeline with its gaps, edits. Today it
has the time bar at its foot, where the thumb rests; another day is only looked back on.
*/
export const DayScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const { language } = useViewer();
  const [date, setDate] = useState<null | string>(null);
  const [sheet, setSheet] = useState<null | SheetTarget>(null);
  const day = hooks.useDay(date);
  const { now } = hooks.useClock();
  const phone = useDayPhone(day, now);
  const sat = useWhereSat(day.date, addDaysIn(day.date, 1, day.zone));
  const header = (
    <ScreenHeader
      eyebrow={formatEyebrow(day.date, day.zone, language)}
      right={<DayNav day={day} onDate={setDate} />}
      title={t("day.title")}
    />
  );
  return (
    <Screen header={header}>
      <Totals day={day} />
      {phone.hasUsageAccess ? <SleepCard phone={phone} zone={day.zone} /> : null}
      {IS_PHONE && !phone.hasUsageAccess ? <UsageAccessHint /> : null}
      {day.entries.length === 0 ? (
        <Text className="px-5 py-6 font-sans text-[14px] text-muted">{t("day.empty")}</Text>
      ) : (
        <Entries entries={day.entries} onOpen={setSheet} phone={phone} sat={sat} zone={day.zone} />
      )}
      <LogPastRow
        hasDivider={day.entries.length > 0}
        onPress={() => {
          setSheet(day.logTarget);
        }}
      />
      {IS_PHONE ? <CalendarSection entries={day.entries} phone={phone} zone={day.zone} /> : null}
      <ScreenTimeSection date={day.date} key={day.date} zone={day.zone} />
      {sheet === null ? null : (
        <ActivitySheet
          onClose={() => {
            setSheet(null);
          }}
          target={sheet}
          zone={day.zone}
        />
      )}
    </Screen>
  );
};
