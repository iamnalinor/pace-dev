import { useState } from "react";
import { Text, View } from "react-native";

import type { RepeatChangeProblem } from "@pace/client";

import { useLanguage, useSettings, useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Calendar } from "#app/ui/calendar.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { formatInZone, type SeriesSchedule } from "@pace/core";

import type { Zoned } from "./date-field.tsx";

type Change = (value: null | SeriesSchedule) => void;

/** "Oct 31, 2026", "31 окт. 2026 г.": a calendar date, the same in every zone. */
const untilText = (until: string, language: string): string =>
  new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${until}T00:00:00.000Z`));
const KINDS = ["daily", "weekdays", "every_n_days", "weekly", "monthly"] as const;

const withKind = (
  kind: (typeof KINDS)[number],
  daysText: string,
  value: null | SeriesSchedule,
): SeriesSchedule => {
  const days = Number(daysText);
  const until = value?.until;
  return kind === "every_n_days"
    ? { kind, days: days >= 1 && days <= 3650 ? days : 2, ...(until !== undefined && { until }) }
    : { kind, ...(until !== undefined && { until }) };
};

/** The repeat rhythm, including a valid every-N interval. */
const RepeatKindPicker = ({
  onChange,
  value,
}: {
  readonly value: null | SeriesSchedule;
  readonly onChange: Change;
}) => {
  const t = useT();
  const [daysText, setDaysText] = useState(
    value?.kind === "every_n_days" ? String(value.days) : "2",
  );
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-1.5">
        <Chip
          onPress={() => {
            onChange(null);
          }}
          selected={value === null}
        >
          {t("form.repeat.none")}
        </Chip>
        {KINDS.map((kind) => (
          <Chip
            key={kind}
            onPress={() => {
              onChange(withKind(kind, daysText, value));
            }}
            selected={value?.kind === kind}
          >
            {t(`form.repeat.${kind}`)}
          </Chip>
        ))}
      </View>
      {value?.kind === "every_n_days" ? (
        <TextField
          inputMode="numeric"
          label={t("form.repeat.days")}
          onChangeText={(raw) => {
            if (!/^\d{0,4}$/u.test(raw)) {
              return;
            }
            setDaysText(raw);
            const days = Number(raw);
            if (days >= 1 && days <= 3650) {
              onChange({ ...value, days });
            }
          }}
          value={daysText}
        />
      ) : null}
    </View>
  );
};

/** The optional final repetition date, on the account's wall clock. */
const RepeatEndPicker = ({
  onChange,
  start,
  value,
}: {
  readonly value: SeriesSchedule;
  readonly start: Zoned;
  readonly onChange: Change;
}) => {
  const t = useT();
  const language = useLanguage();
  const { timezone } = useSettings();
  const viewer = useViewer();
  const [isOpen, setIsOpen] = useState(false);
  const zone = start?.tz ?? timezone ?? viewer.deviceTz;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-1.5">
        <Chip
          onPress={() => {
            onChange({ ...value, until: undefined });
            setIsOpen(false);
          }}
          selected={value.until === undefined}
        >
          {t("form.repeat.noEnd")}
        </Chip>
        <Chip
          onPress={() => {
            setIsOpen((current) => !current);
          }}
          selected={value.until !== undefined}
        >
          {value.until === undefined ? t("form.repeat.endDate") : untilText(value.until, language)}
        </Chip>
      </View>
      {isOpen ? (
        <View className="rounded-xl border border-line bg-bg p-3">
          <Calendar
            labels={{ next: t("calendar.nextMonth"), previous: t("calendar.previousMonth") }}
            language={language}
            onPick={(until) => {
              onChange({ ...value, until });
              setIsOpen(false);
            }}
            selected={value.until ?? null}
            today={formatInZone(viewer.now, zone, "yyyy-MM-dd")}
          />
        </View>
      ) : null}
    </View>
  );
};

const PROBLEM_TEXT = {
  "repeat/due-before-start": "form.repeat.dueBeforeStart",
  "repeat/due-passed": "form.repeat.duePassed",
  "repeat/until-before-start": "form.repeat.untilBeforeStart",
} as const;

/** A task's own repeat schedule, independent of its category preset. */
export const RecurrenceField = ({
  onChange,
  problem = null,
  start,
  value,
}: {
  readonly value: null | SeriesSchedule;
  readonly start: Zoned;
  readonly onChange: Change;
  /** Why saving this choice would be refused, said under the field. */
  readonly problem?: null | RepeatChangeProblem;
}) => {
  const t = useT();
  return (
    <View className="gap-2">
      <Text className="font-sans text-[12px] text-muted">{t("form.repeat")}</Text>
      <RepeatKindPicker onChange={onChange} value={value} />
      {value === null ? null : <RepeatEndPicker onChange={onChange} start={start} value={value} />}
      {problem === null || problem === "repeat/task-unknown" ? null : (
        <Text className="font-sans text-[12px] text-warn">{t(PROBLEM_TEXT[problem])}</Text>
      )}
    </View>
  );
};
