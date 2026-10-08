import { Text, View } from "react-native";

import { useLanguage, usePace, useSettings, useT } from "#app/app-state.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { TimeInput } from "#app/ui/time-input.tsx";
import { isOverridden, setValue, toggleOverride } from "@pace/client";
import {
  dueWeekOffset,
  type Language,
  type Recurrence,
  type Weekday,
  type WeekSlot,
} from "@pace/core";

import type { SectionProps } from "./rows.tsx";

import { ChoiceChips } from "./choice-chips.tsx";
import { OverrideRow } from "./override-row.tsx";

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** January 1, 2024 was a Monday: day `n` of that week names ISO weekday `n`. */
const weekdayName = (weekday: Weekday, language: Language): string =>
  new Intl.DateTimeFormat(language, { timeZone: "UTC", weekday: "short" }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  );

const SlotFields = ({
  dayLabel,
  onSlot,
  slot,
  timeLabel,
}: {
  readonly slot: WeekSlot;
  readonly dayLabel: string;
  readonly timeLabel: string;
  readonly onSlot: (slot: WeekSlot) => void;
}) => {
  const language = useLanguage();
  return (
    <View className="gap-1.5">
      <Text className="font-sans text-[12px] text-muted">{dayLabel}</Text>
      <ChoiceChips
        label={dayLabel}
        labelOf={(day) => weekdayName(day, language)}
        onChange={(weekday) => {
          onSlot({ ...slot, weekday });
        }}
        value={slot.weekday}
        values={WEEKDAYS}
      />
      <Text className="font-sans text-[12px] text-muted">{timeLabel}</Text>
      <TimeInput
        className="w-24"
        label={timeLabel}
        onTime={(time) => {
          onSlot({ ...slot, time });
        }}
        value={slot.time}
      />
    </View>
  );
};

const Schedule = ({
  onRecurrence,
  recurrence,
}: {
  readonly recurrence: Recurrence;
  readonly onRecurrence: (recurrence: Recurrence) => void;
}) => {
  const t = useT();
  return (
    <View className="gap-3 pl-3 pt-2">
      <SlotFields
        dayLabel={t("presets.issuedOn")}
        onSlot={(issued) => {
          onRecurrence({ ...recurrence, issued });
        }}
        slot={recurrence.issued}
        timeLabel={t("presets.issuedAt")}
      />
      <SlotFields
        dayLabel={t("presets.dueOn")}
        onSlot={(due) => {
          onRecurrence({ ...recurrence, due });
        }}
        slot={recurrence.due}
        timeLabel={t("presets.dueAt")}
      />
      {dueWeekOffset(recurrence) === 1 ? (
        <Text className="font-sans text-[12px] text-question">{t("presets.dueNextWeek")}</Text>
      ) : null}
      <TextField
        autoCapitalize="none"
        label={t("presets.zone")}
        onChangeText={(tz) => {
          onRecurrence({ ...recurrence, tz: tz.trim() });
        }}
        value={recurrence.tz}
      />
    </View>
  );
};

/** The weekly homework schedule: issued and due slots in a zone, or none at all. */
export const RecurrenceRow = (section: SectionProps) => {
  const t = useT();
  const { timezone } = useSettings();
  const { deviceTz } = usePace().hooks.useClock();
  const { definition, inherited, onChange } = section;
  const recurrence =
    definition.recurrence === undefined ? inherited.recurrence : definition.recurrence;
  const onRecurrence = (next: null | Recurrence): void => {
    onChange(setValue(definition, "recurrence", next));
  };
  const fresh: Recurrence = {
    due: { time: "23:59", weekday: 3 },
    issued: { time: "10:00", weekday: 1 },
    tz: timezone ?? deviceTz,
  };
  return (
    <OverrideRow
      inheritedHint={section.inheritedHint}
      invalid={section.issues.has("recurrence")}
      isOverridden={isOverridden(definition, "recurrence")}
      label={t("presets.field.recurrence")}
      onToggle={() => {
        onChange(toggleOverride(definition, "recurrence", inherited));
      }}
    >
      {() => (
        <>
          <SwitchRow
            isOn={recurrence !== null}
            label={t("presets.repeats")}
            onChange={(isOn) => {
              onRecurrence(isOn ? fresh : null);
            }}
          />
          {recurrence === null ? null : (
            <Schedule onRecurrence={onRecurrence} recurrence={recurrence} />
          )}
        </>
      )}
    </OverrideRow>
  );
};
