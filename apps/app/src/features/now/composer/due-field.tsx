import { CalendarDays } from "lucide-react-native";
import { Text, View } from "react-native";

import type { ComposerModel } from "@pace/client";

import { useSettings, useT } from "#app/app-state.tsx";
import { fromWallClock, wallClock, zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Calendar } from "#app/ui/calendar.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";

type Due = ComposerModel["due"];

/** A due typed without a time ends the day: 23:59 on the zone's clock. */
const END_OF_DAY = "23:59";

/** The due's chip: its exact date and time ("Thu Oct 13 23:59"), or "No deadline". */
export const DueChip = ({
  due,
  isOpen,
  onToggle,
}: {
  readonly due: Due;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { palette } = useTheme();
  const text = due === null ? t("composer.noDue") : zonedText({ ...due, mode: "due" }, viewer);
  return (
    <Chip
      label={`${t("composer.due")}: ${text}`}
      leading={<CalendarDays color={palette.fg2} size={14} strokeWidth={1.75} />}
      onPress={onToggle}
      selected={isOpen}
    >
      {text}
    </Chip>
  );
};

/**
The deadline panel: a month calendar and the time, both read on the due's own zone (the
account's for a new one). The zone is named only when it is not the device's.
*/
export const DuePanel = ({
  due,
  onClose,
  onDue,
}: {
  readonly due: Due;
  readonly onDue: (due: Due) => void;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { timezone } = useSettings();
  const tz = due?.tz ?? timezone ?? viewer.deviceTz;
  const today = wallClock(viewer.now, tz).date;
  const shown = due === null ? { date: null, time: END_OF_DAY } : wallClock(due.at, tz);
  const { time } = shown;
  const set = (date: string, at: string): void => {
    const instant = fromWallClock({ date, time: at, tz });
    if (instant !== null) {
      onDue({ at: instant, tz });
    }
  };
  return (
    <View className="gap-3 rounded-xl border border-line bg-bg p-3">
      <Calendar
        labels={{ next: t("calendar.nextMonth"), previous: t("calendar.previousMonth") }}
        language={viewer.language}
        onPick={(date) => {
          set(date, time);
        }}
        selected={shown.date}
        today={today}
      />
      <View className="flex-row items-center gap-2">
        <Text className="font-sans text-[13px] text-muted">{t("composer.dueTime")}</Text>
        <TimeInput
          className="w-24"
          key={time}
          label={t("composer.dueTime")}
          onTime={(next) => {
            set(shown.date ?? today, next);
          }}
          value={time}
        />
        {tz === viewer.deviceTz ? null : (
          <Text className="font-mono text-[12px] text-muted">{t("add.dueZone", { tz })}</Text>
        )}
      </View>
      <View className="flex-row justify-end gap-2">
        {due === null ? null : (
          <Button
            onPress={() => {
              onDue(null);
            }}
            variant="ghost"
          >
            {t("composer.clear")}
          </Button>
        )}
        <Button onPress={onClose} variant="secondary">
          {t("common.done")}
        </Button>
      </View>
    </View>
  );
};
