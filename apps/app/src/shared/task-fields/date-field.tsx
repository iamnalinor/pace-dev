import type { RefObject } from "react";

import { Text, View } from "react-native";

import { useSettings, useT } from "#app/app-state.tsx";
import { fromWallClock, wallClock, zonedText } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Calendar } from "#app/ui/calendar.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { useRevealOnShow } from "#app/ui/overlay-reveal.ts";
import { TimeCheckScope, useCheckedSubmit, useTimeChecks } from "#app/ui/time-check.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";

import { useOutsidePress } from "./use-outside-press.ts";

/** A time a person sets, with the zone it was set in; `null` when not set. */
export type Zoned = null | { readonly at: string; readonly tz: string };

/** Which date a field holds: the deadline, or the start. */
export type DateKind = "due" | "final" | "start";

/** A due typed without a time ends the day; a start without one begins it. */
const DEFAULT_TIME: Readonly<Record<DateKind, string>> = {
  due: "23:59",
  final: "23:59",
  start: "09:00",
};

const dateLabel = (kind: DateKind): "composer.due" | "edit.start" | "form.final" => {
  if (kind === "start") {
    return "edit.start";
  }
  return kind === "final" ? "form.final" : "composer.due";
};

const emptyDateLabel = (
  kind: DateKind,
): "composer.noDue" | "form.finalNotSet" | "form.startNow" => {
  if (kind === "start") {
    return "form.startNow";
  }
  return kind === "final" ? "form.finalNotSet" : "composer.noDue";
};

/** A start plays from then; a due and a final deadline are dates on the calendar. */
const DATE_ICONS = { due: "calendar-days", final: "calendar-clock", start: "play" } as const;

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
  const unset = t(emptyDateLabel(kind));
  const text = value === null ? unset : zonedText({ ...value, mode: "due" }, viewer);

  return (
    <Chip
      expanded={isOpen}
      icon={DATE_ICONS[kind]}
      isWhole
      label={`${t(dateLabel(kind))}: ${text}`}
      onPress={onToggle}
    >
      {kind === "start" && value !== null ? `${t("edit.start")} ${text}` : text}
    </Chip>
  );
};

/** Clear (for a date that is set) and Done. */
const PanelButtons = ({
  onClear,
  onDone,
}: {
  readonly onClear: (() => void) | null;
  readonly onDone: () => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row justify-end gap-2">
      {onClear === null ? null : (
        <Button onPress={onClear} variant="plain">
          {t("composer.clear")}
        </Button>
      )}
      <Button onPress={onDone} variant="secondary">
        {t("common.done")}
      </Button>
    </View>
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
  region,
  value: due,
}: {
  readonly kind: DateKind;
  readonly value: Zoned;
  readonly onChange: (value: Zoned) => void;
  readonly onClose: () => void;
  /**
  The chip and the panel: a pointer anywhere else (on the web) closes it as Done does, so a time
  it cannot read keeps it open and says so, and the Save the pointer went to finds it (R28-01).
  */
  readonly region: RefObject<null | View>;
}) => {
  const t = useT();
  const viewer = useViewer();
  const { timezone } = useSettings();
  const tz = due?.tz ?? timezone ?? viewer.deviceTz;
  const today = wallClock(viewer.now, tz).date;
  const shown = due === null ? { date: null, time: DEFAULT_TIME[kind] } : wallClock(due.at, tz);
  const { time } = shown;
  const times = useTimeChecks();
  // Done keeps the panel open on a time it cannot read, and says so (R27-02); a time handed over
  // by the press closes it in one press (review I3).
  const done = useCheckedSubmit(times, onClose);
  useOutsidePress(region, true, done);
  // Unfolded in a sheet, the panel scrolls whole into view above the pinned Save (R27-06).
  const panelRef = useRevealOnShow("date-panel");
  const set = (date: string, at: string): void => {
    const instant = fromWallClock({ date, time: at, tz });
    if (instant !== null) {
      onChange({ at: instant, tz });
    }
  };
  return (
    <View className="gap-3 rounded-xl border border-separator bg-app p-3" ref={panelRef}>
      <Calendar
        labels={{ next: t("calendar.nextMonth"), previous: t("calendar.previousMonth") }}
        language={viewer.language}
        onPick={(date) => {
          set(date, time);
          onClose();
        }}
        selected={shown.date}
        today={today}
      />
      <View className="flex-row items-center gap-2">
        <Text className="font-sans text-footnote text-label-secondary">
          {t(kind === "final" ? "form.finalTime" : "composer.dueTime")}
        </Text>
        <TimeCheckScope checks={times}>
          <TimeInput
            className="w-24"
            isDraft
            label={t(kind === "final" ? "form.finalTime" : "composer.dueTime")}
            onTime={(next) => {
              set(shown.date ?? today, next);
            }}
            value={time}
          />
        </TimeCheckScope>
        {tz === viewer.deviceTz ? null : (
          <Text className="font-sans text-caption font-normal tabular-nums text-label-tertiary">
            {t("add.dueZone", { tz })}
          </Text>
        )}
      </View>
      <PanelButtons
        onClear={
          due === null
            ? null
            : () => {
                onChange(null);
              }
        }
        onDone={done}
      />
    </View>
  );
};
