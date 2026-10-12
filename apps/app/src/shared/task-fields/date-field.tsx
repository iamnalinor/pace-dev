import { CalendarDays, Play } from "lucide-react-native";
import { Text, View } from "react-native";

import { useSettings, useT } from "#app/app-state.tsx";
import { fromWallClock, wallClock, zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Calendar } from "#app/ui/calendar.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";

/** A time a person sets, with the zone it was set in; `null` when not set. */
export type Zoned = null | { readonly at: string; readonly tz: string };

/** Which date a field holds: the deadline, or the start. */
export type DateKind = "due" | "start";

/** A due typed without a time ends the day; a start without one begins it. */
const DEFAULT_TIME: Readonly<Record<DateKind, string>> = { due: "23:59", start: "09:00" };

/** The date's chip: its exact date and time ("Oct 13 23:59"), or what an unset one means. */
export const DateChip = ({
  isOpen,
  kind,
  onToggle,
  value,
}: {
  readonly kind: DateKind;
  readonly value: Zoned;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { palette } = useTheme();
  const unset = t(kind === "due" ? "composer.noDue" : "form.startNow");
  const text = value === null ? unset : zonedText({ ...value, mode: "due" }, viewer);
  const Icon = kind === "due" ? CalendarDays : Play;
  return (
    <Chip
      label={`${t(kind === "due" ? "composer.due" : "edit.start")}: ${text}`}
      leading={<Icon color={palette.fg2} size={14} strokeWidth={1.75} />}
      onPress={onToggle}
      selected={isOpen}
    >
      {kind === "start" && value !== null ? `${t("edit.start")} ${text}` : text}
    </Chip>
  );
};

/**
A date panel: a month calendar and the time, both read on the value's own zone (the
account's for a new one). The zone is named only when it is not the device's.
*/
export const DatePanel = ({
  kind,
  onChange,
  onClose,
  value: due,
}: {
  readonly kind: DateKind;
  readonly value: Zoned;
  readonly onChange: (value: Zoned) => void;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { timezone } = useSettings();
  const tz = due?.tz ?? timezone ?? viewer.deviceTz;
  const today = wallClock(viewer.now, tz).date;
  const shown = due === null ? { date: null, time: DEFAULT_TIME[kind] } : wallClock(due.at, tz);
  const { time } = shown;
  const set = (date: string, at: string): void => {
    const instant = fromWallClock({ date, time: at, tz });
    if (instant !== null) {
      onChange({ at: instant, tz });
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
          <Text className="font-sans text-[12px] tabular-nums text-muted">
            {t("add.dueZone", { tz })}
          </Text>
        )}
      </View>
      <View className="flex-row justify-end gap-2">
        {due === null ? null : (
          <Button
            onPress={() => {
              onChange(null);
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
