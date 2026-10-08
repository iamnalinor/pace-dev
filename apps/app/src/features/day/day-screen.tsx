import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { DayEntry, DayModel, DayRowProps } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { ColorTag } from "#app/ui/color.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { formatDuration, formatEyebrow } from "@pace/core";

import { ActivitySheet, type SheetTarget } from "./activity-sheet.tsx";
import {
  CalendarSection,
  EndedAtPrompt,
  SleepCard,
  UsageAccessHint,
  UsageLine,
} from "./phone-section.tsx";
import { type DayPhone, useDayPhone } from "./use-day-phone.ts";

const ActivityRow = ({ onEdit, row, zone }: DayRowProps) => {
  const t = useT();
  const router = useRouter();
  const { language } = useViewer();
  const range = `${clockTime(row.startAt, zone)}–${row.isRunning ? "" : clockTime(row.endAt, zone)}`;
  return (
    <Pressable
      accessibilityHint={t("day.edit", { label: row.label })}
      accessibilityRole="button"
      className="flex-row items-start gap-3 border-t border-line py-2.5 active:opacity-70"
      onPress={onEdit}
    >
      <Text className="w-[86px] pt-0.5 font-mono text-[12px] text-muted">{range}</Text>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <ColorTag color={row.color}>{t(`category.${row.category}`)}</ColorTag>
          <Text className="font-sans text-[14px] font-medium text-fg" numberOfLines={1}>
            {row.label}
          </Text>
          {row.isRunning ? (
            <Text className="font-sans text-[12px] text-accentText">{t("day.running")}</Text>
          ) : null}
        </View>
        {row.taskId !== null && row.taskTitle !== null ? (
          <Text
            accessibilityRole="link"
            className="font-sans text-[12px] text-fg2 underline"
            numberOfLines={1}
            onPress={() => {
              router.push(`/task/${row.taskId ?? ""}`);
            }}
          >
            {row.taskTitle}
          </Text>
        ) : null}
      </View>
      <Text className="pt-0.5 font-mono text-[12px] text-fg2">
        {formatDuration(row.minutes, language)}
      </Text>
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

/** One line of the day; a tap opens its sheet (edit the block, or log the gap). */
const EntryRow = ({
  entry,
  onOpen,
  phone,
  zone,
}: {
  readonly entry: DayEntry;
  readonly zone: string;
  readonly phone: DayPhone;
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
      <UsageLine apps={phone.usageIn(entry.row.startAt, entry.row.endAt)} row={entry.row} />
      <EndedAtPrompt phone={phone} row={entry.row} zone={zone} />
    </>
  );
};

/** The day's blocks and the gaps between them, in time order. */
const Entries = ({
  entries,
  onOpen,
  phone,
  zone,
}: {
  readonly entries: readonly DayEntry[];
  readonly zone: string;
  readonly phone: DayPhone;
  readonly onOpen: (target: SheetTarget) => void;
}) => (
  <View className="px-5">
    {entries.map((entry) => (
      <EntryRow entry={entry} key={entry.key} onOpen={onOpen} phone={phone} zone={zone} />
    ))}
  </View>
);

/** Previous day, back to today, next day (none past today). */
const DayNav = ({
  day,
  onDate,
}: {
  readonly day: DayModel;
  readonly onDate: (date: null | string) => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row items-center gap-1">
      <IconButton
        icon={ChevronLeft}
        label={t("day.previous")}
        onPress={() => {
          onDate(day.previous);
        }}
        variant="plain"
      />
      {day.isToday ? null : (
        <Button
          onPress={() => {
            onDate(null);
          }}
          variant="ghost"
        >
          {t("day.today")}
        </Button>
      )}
      <IconButton
        disabled={day.next === null}
        icon={ChevronRight}
        label={t("day.next")}
        onPress={() => {
          onDate(day.next);
        }}
        variant="plain"
      />
    </View>
  );
};

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
      {phone.hasUsageAccess ? <SleepCard phone={phone} zone={day.zone} /> : <UsageAccessHint />}
      {day.entries.length === 0 ? (
        <Text className="px-5 py-6 font-sans text-[14px] text-muted">{t("day.empty")}</Text>
      ) : (
        <Entries entries={day.entries} onOpen={setSheet} phone={phone} zone={day.zone} />
      )}
      <CalendarSection entries={day.entries} phone={phone} zone={day.zone} />
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
