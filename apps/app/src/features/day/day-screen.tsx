import { Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import type { DayEntry, DayModel, DayRowProps } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { IS_PHONE } from "#app/platform/device.ts";
import { useOpenTask } from "#app/shared/task-opener.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useWhereSat } from "#app/shared/use-where-sat.ts";
import { WhereSatLine } from "#app/shared/where-sat-line.tsx";
import { Button } from "#app/ui/button.tsx";
import { ColorTag } from "#app/ui/color.tsx";
import { cx } from "#app/ui/cx.ts";
import { ROW_ENTER, ROW_EXIT, ROW_LAYOUT } from "#app/ui/motion.ts";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { addDaysIn, formatDuration, formatEyebrow, type Language, type SatRow } from "@pace/core";

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
A block of the day: "14:06 – 14:40" (or "– now" while it runs), the category tag and the
label when it says more than the tag, its task, then the duration against its Expect or
Limit and a pencil. The whole row opens the edit sheet.
*/
const ActivityRow = ({ onEdit, row, zone }: DayRowProps) => {
  const t = useT();
  const openTask = useOpenTask();
  const { language } = useViewer();
  const { palette } = useTheme();
  const range = `${clockTime(row.startAt, zone)} – ${row.isRunning ? t("day.now") : clockTime(row.endAt, zone)}`;
  const target = targetText(row, t, language);
  return (
    <Pressable
      accessibilityHint={t("day.edit", { label: row.label })}
      accessibilityRole="button"
      className="min-h-14 flex-row items-center gap-3 border-t border-line py-2 active:opacity-70"
      onPress={onEdit}
    >
      <Text className="w-[104px] font-sans text-[12px] tabular-nums text-muted">{range}</Text>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <ColorTag color={row.color}>{t(`category.${row.category}`)}</ColorTag>
          {row.showsLabel ? (
            <Text className="font-sans text-[14px] font-medium text-fg" numberOfLines={1}>
              {row.label}
            </Text>
          ) : null}
        </View>
        {row.taskId !== null && row.taskTitle !== null ? (
          <Text
            accessibilityRole="link"
            className="font-sans text-[12px] text-fg2 underline"
            numberOfLines={1}
            onPress={() => {
              openTask(row.taskId ?? "");
            }}
          >
            {row.taskTitle}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text
          className={cx(
            "font-sans text-[13px] tabular-nums",
            row.isRunning ? "text-accentText" : "text-fg",
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

const GapRow = ({ minutes, onLog }: { readonly minutes: number; readonly onLog: () => void }) => {
  const t = useT();
  const { language } = useViewer();
  return (
    <View className="my-1 flex-row items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-1.5">
      <Text className="font-sans text-[12px] text-muted">
        {t("day.gap", { duration: formatDuration(minutes, language) })}
      </Text>
      <Button onPress={onLog} variant="ghost">
        {t("day.logGap")}
      </Button>
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
  const open = (): void => {
    onOpen(entry.target);
  };
  if (entry.kind === "gap") {
    return <GapRow minutes={entry.gap.minutes} onLog={open} />;
  }
  return (
    <>
      <ActivityRow onEdit={open} row={entry.row} zone={zone} />
      <UsageLine apps={phone.usageIn(entry.row.startAt, entry.row.endAt)} />
      <WhereSatLine rows={sat(entry.row.startAt, entry.row.endAt)} />
      <EndedAtPrompt phone={phone} row={entry.row} zone={zone} />
    </>
  );
};

/** The day's blocks and the gaps between them, in time order. */
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
  <View className="px-5">
    {entries.map((entry) => (
      <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT} key={entry.key} layout={ROW_LAYOUT}>
        <EntryRow entry={entry} onOpen={onOpen} phone={phone} sat={sat} zone={zone} />
      </Animated.View>
    ))}
  </View>
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

/** One day of the time ledger: totals per category, the timeline with its gaps, edits. */
export const DayScreen = () => {
  const t = useT();
  const { hooks } = usePace();
  const { language } = useViewer();
  const { palette } = useTheme();
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
      {IS_PHONE ? <CalendarSection entries={day.entries} phone={phone} zone={day.zone} /> : null}
      <Pressable
        accessibilityRole="button"
        className="mx-5 mt-4 h-11 flex-row items-center justify-center gap-2 rounded-lg border border-line active:opacity-70"
        onPress={() => {
          setSheet(day.logTarget);
        }}
      >
        <Plus color={palette.fg} size={16} />
        <Text className="font-sans text-[14px] text-fg">{t("day.logPast")}</Text>
      </Pressable>
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
