import { type Ref, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";

import type { ActivityForm, ActivityRange, ActivityTarget, FormPartProps } from "@pace/client";

import { useLanguage, useT } from "#app/app-state.tsx";
import { fromWallClock, wallClock } from "#app/format/time.ts";
import { moveFocus } from "#app/platform/move-focus.ts";
import { OptionRow } from "#app/shared/task-fields/option-row.tsx";
import { ActionChip, Chip } from "#app/ui/chip.tsx";
import { formatShortDay } from "@pace/core";

import { dayChoicesOf, isAcrossDays } from "./activity-draft.ts";

/** One time's day: a chip per day it may be put on, the day it reads on now checked. */
const DayRow = ({
  checkedRef,
  days,
  label,
  onChoose,
  spoken,
  value,
  zone,
}: {
  readonly checkedRef?: Ref<View>;
  readonly days: readonly string[];
  readonly label: string;
  readonly onChoose: (day: string) => void;
  readonly spoken: (day: string) => string;
  readonly value: string;
  readonly zone: string;
}) => {
  const language = useLanguage();
  return (
    <OptionRow label={label}>
      {days.map((day) => {
        const shown = formatShortDay(
          fromWallClock({ date: day, time: "12:00", tz: zone }) ?? `${day}T12:00:00.000Z`,
          zone,
          language,
        );
        return (
          <Chip
            key={day}
            label={spoken(shown)}
            onPress={() => {
              onChoose(day);
            }}
            ref={day === value ? checkedRef : undefined}
            selected={day === value}
          >
            {shown}
          </Chip>
        );
      })}
    </OptionRow>
  );
};

/**
The days the start and the end are on, for times typed as a clock only: shown at once for a block
across days, behind "Other days" for one within a day. Round 6: a block left running from Friday
to Sunday is cut back to Friday by choosing Friday; the clock rules alone read a time near the old
end. The day checked is the one each time reads on now, so it follows what is typed.
*/
export const DayChoices = ({
  draft,
  patch,
  range,
  target,
  zone,
}: FormPartProps<ActivityForm> & {
  readonly range: ActivityRange | null;
  readonly target: ActivityTarget;
  readonly zone: string;
}) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(() => isAcrossDays(target, zone));
  const [hasOpened, setHasOpened] = useState(false);
  const checkedEndRef = useRef<View>(null);
  useLayoutEffect(() => {
    if (hasOpened) {
      // "Other days" went away under the focus: it moves onto the day the end is on.
      moveFocus(checkedEndRef.current);
    }
  }, [hasOpened]);
  const days = dayChoicesOf(target, zone);
  if (days.to.length === 0) {
    return null;
  }
  if (!isOpen) {
    return (
      <View className="flex-row">
        <ActionChip
          onPress={() => {
            setIsOpen(true);
            setHasOpened(true);
          }}
        >
          {t("day.otherDays")}
        </ActionChip>
      </View>
    );
  }
  const dayOf = (atIso: null | string | undefined, fallback: string): string =>
    atIso === null || atIso === undefined ? fallback : wallClock(atIso, zone).date;
  const startDay = draft.fromDay ?? dayOf(range?.startAt, dayOf(target.startAt, ""));
  const endDay = draft.toDay ?? dayOf(range?.endAt, dayOf(target.endAt, startDay));
  return (
    <>
      {days.from.length > 1 ? (
        <DayRow
          days={days.from}
          label={t("day.startDay")}
          onChoose={(fromDay) => {
            patch({ fromDay });
          }}
          spoken={(day) => t("day.startsOn", { day })}
          value={startDay}
          zone={zone}
        />
      ) : null}
      <DayRow
        checkedRef={checkedEndRef}
        days={days.to}
        label={t("day.endDay")}
        onChoose={(toDay) => {
          patch({ toDay });
        }}
        spoken={(day) => t("day.endsOn", { day })}
        value={endDay}
        zone={zone}
      />
    </>
  );
};
