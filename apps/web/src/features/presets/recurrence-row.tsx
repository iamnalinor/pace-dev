import { useId } from "react";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";
import {
  dueWeekOffset,
  type Language,
  type Recurrence,
  type Weekday,
  type WeekSlot,
} from "@pace/core";

import type { SectionProps } from "./rows.tsx";

import { CONTROL_CLASS } from "./control-class.ts";
import { OverrideRow } from "./override-row.tsx";
import { isOverridden, setValue, toggleOverride } from "./preset-draft.ts";

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** January 1, 2024 was a Monday: day `n` of that week names ISO weekday `n`. */
const weekdayName = (weekday: Weekday, language: Language): string =>
  new Intl.DateTimeFormat(language, { timeZone: "UTC", weekday: "long" }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  );

type SlotProps = {
  readonly slot: WeekSlot;
  readonly dayLabel: string;
  readonly timeLabel: string;
  readonly disabled: boolean;
  readonly onSlot: (slot: WeekSlot) => void;
};

const SlotFields = ({ dayLabel, disabled, onSlot, slot, timeLabel }: SlotProps) => {
  const language = useLanguage();
  const id = useId();
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="grid gap-1">
        <label className="text-xs text-muted" htmlFor={`${id}-day`}>
          {dayLabel}
        </label>
        <select
          className={CONTROL_CLASS}
          disabled={disabled}
          id={`${id}-day`}
          onChange={(event) => {
            const weekday = WEEKDAYS.find((day) => String(day) === event.target.value);
            if (weekday !== undefined) {
              onSlot({ ...slot, weekday });
            }
          }}
          value={slot.weekday}
        >
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {weekdayName(day, language)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <label className="text-xs text-muted" htmlFor={`${id}-time`}>
          {timeLabel}
        </label>
        <input
          className={cn(CONTROL_CLASS, "font-mono")}
          disabled={disabled}
          id={`${id}-time`}
          onChange={(event) => {
            if (event.target.value !== "") {
              onSlot({ ...slot, time: event.target.value });
            }
          }}
          type="time"
          value={slot.time}
        />
      </div>
    </div>
  );
};

const Schedule = ({
  disabled,
  onRecurrence,
  recurrence,
}: {
  readonly recurrence: Recurrence;
  readonly disabled: boolean;
  readonly onRecurrence: (recurrence: Recurrence) => void;
}) => {
  const t = useT();
  const id = useId();
  return (
    <div className="grid gap-2 pl-3">
      <SlotFields
        dayLabel={t("presets.issuedOn")}
        disabled={disabled}
        onSlot={(issued) => {
          onRecurrence({ ...recurrence, issued });
        }}
        slot={recurrence.issued}
        timeLabel={t("presets.issuedAt")}
      />
      <SlotFields
        dayLabel={t("presets.dueOn")}
        disabled={disabled}
        onSlot={(due) => {
          onRecurrence({ ...recurrence, due });
        }}
        slot={recurrence.due}
        timeLabel={t("presets.dueAt")}
      />
      {dueWeekOffset(recurrence) === 1 && (
        <p className="text-xs text-question">{t("presets.dueNextWeek")}</p>
      )}
      <label className="text-xs text-muted" htmlFor={id}>
        {t("presets.zone")}
      </label>
      <input
        className={cn(CONTROL_CLASS, "font-mono")}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onRecurrence({ ...recurrence, tz: event.target.value.trim() });
        }}
        value={recurrence.tz}
      />
    </div>
  );
};

/** The weekly homework schedule: issued and due slots in a zone, or none at all. */
export const RecurrenceRow = (section: SectionProps) => {
  const t = useT();
  const { hooks } = useServices();
  const { timezone } = hooks.useSettings();
  const { deviceTz } = hooks.useClock();
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
      invalid={section.issues.has("recurrence")}
      isOverridden={isOverridden(definition, "recurrence")}
      label={t("presets.field.recurrence")}
      labelsControl={false}
      onToggle={() => {
        onChange(toggleOverride(definition, "recurrence", inherited));
      }}
      parentName={section.parentName}
    >
      {({ disabled }) => (
        <>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              checked={recurrence !== null}
              className="size-4 accent-accent"
              disabled={disabled}
              onChange={(event) => {
                onRecurrence(event.target.checked ? fresh : null);
              }}
              type="checkbox"
            />
            {t("presets.repeats")}
          </label>
          {recurrence !== null && (
            <Schedule disabled={disabled} onRecurrence={onRecurrence} recurrence={recurrence} />
          )}
        </>
      )}
    </OverrideRow>
  );
};
