import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ActionResult, ChoiceView, StartOptions, TimeButtonView } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Sheet } from "#app/ui/sheet.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { formatDuration } from "@pace/core";

import type { CalendarToday } from "./calendar-today.ts";

/** One line of the sheet: what starts, how long it usually takes, a check on the running one. */
const ChoiceRow = ({
  aside,
  isRunning = false,
  label,
  onPress,
}: {
  readonly label: string;
  readonly aside: null | string;
  readonly isRunning?: boolean;
  readonly onPress: () => void;
}) => {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center gap-3 rounded-lg border border-line bg-surface px-3.5 active:opacity-70"
      onPress={onPress}
    >
      <Text className="flex-1 font-sans text-[15px] text-fg">{label}</Text>
      {aside === null ? null : (
        <Text className="font-sans text-[13px] tabular-nums text-muted">{aside}</Text>
      )}
      {isRunning ? <Check color={palette.fg} size={16} /> : null}
    </Pressable>
  );
};

type ListProps = {
  readonly button: TimeButtonView;
  readonly calendar: CalendarToday | null;
  readonly start: (result: ActionResult) => void;
  readonly options: StartOptions;
};

/** A button's choices: sport by its length, chores by name, each with its usual length. */
const ButtonChoices = ({ button, options, start }: ListProps) => {
  const t = useT();
  const { language } = useViewer();
  const { actions } = usePace();
  const labelOf = (choice: ChoiceView): string => {
    if (choice.labelKey !== null) {
      return t(choice.labelKey);
    }
    return button.choices.length > 1
      ? formatDuration(choice.expectMinutes, language)
      : t(button.labelKey);
  };
  return button.choices.map((choice) => (
    <ChoiceRow
      aside={
        choice.labelKey === null && button.choices.length > 1
          ? null
          : `~${formatDuration(choice.expectMinutes, language)}`
      }
      isRunning={choice.isRunning}
      key={choice.id}
      label={labelOf(choice)}
      onPress={() => {
        start(actions.startChoice(choice.id, options));
      }}
    />
  ));
};

/** Today's events from the calendar (own or accepted), or why there are none. */
const CalendarChoices = ({ calendar, options, start }: ListProps) => {
  const t = useT();
  const { deviceTz } = useViewer();
  const { actions } = usePace();
  const events = calendar?.events ?? [];
  if (events.length === 0) {
    return (
      <Text className="font-sans text-[14px] text-muted">
        {t(calendar?.access === "granted" ? "time.calendarNone" : "phone.calendarAsk")}
      </Text>
    );
  }
  return (
    <View aria-label={t("time.calendarToday")} className="gap-2" role="list">
      {events.map((event) => (
        <ChoiceRow
          aside={`${clockTime(event.startAt, deviceTz)}–${clockTime(event.endAt, deviceTz)}`}
          key={event.id}
          label={event.title}
          onPress={() => {
            start(actions.startCalendar(event, options));
          }}
        />
      ))}
    </View>
  );
};

/**
Behind a button (a tap on Sport or Chores, a long press, a right click or "⋯" on any): what it
can start, and whether it should run alongside the activity going on now.
*/
export const ChoicesSheet = ({
  button,
  calendar,
  canGoAlongside,
  onClose,
}: {
  readonly button: TimeButtonView;
  readonly calendar: CalendarToday | null;
  readonly canGoAlongside: boolean;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const run = useRunAction();
  const [isAlongside, setIsAlongside] = useState(false);
  const props: ListProps = {
    button,
    calendar,
    options: { alongside: isAlongside },
    start: (result) => {
      void (async () => {
        if (await run(result)) {
          onClose();
        }
      })();
    },
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t(button.labelKey)} visible>
      {canGoAlongside ? (
        <SwitchRow isOn={isAlongside} label={t("time.alongside")} onChange={setIsAlongside} />
      ) : null}
      <View className="gap-2">
        {button.kind === "calendar" ? <CalendarChoices {...props} /> : <ButtonChoices {...props} />}
      </View>
    </Sheet>
  );
};
