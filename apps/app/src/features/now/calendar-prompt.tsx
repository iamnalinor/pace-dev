import { Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useCalendarPrompt } from "#app/shared/tracking/use-calendar-prompt.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";

/**
A calendar event about to start (or going on) that nobody answered yet: Attend tracks it under
its title from its start, Skip hides it on this phone.
*/
export const CalendarPrompt = () => {
  const t = useT();
  const { actions } = usePace();
  const { deviceTz } = useViewer();
  const run = useRunAction();
  const { event, skip } = useCalendarPrompt();
  if (event === null) {
    return null;
  }
  return (
    <View
      aria-label={t("day.calendar")}
      className="mx-4 mb-3 gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3"
      role="region"
    >
      <View className="gap-0.5">
        <Text className="font-sans text-[15px] font-medium text-fg">{event.title}</Text>
        <Text className="font-sans text-[13px] tabular-nums text-muted">
          {`${clockTime(event.startAt, deviceTz)}–${clockTime(event.endAt, deviceTz)}`}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            onPress={() => {
              void run(actions.startCalendar(event));
            }}
          >
            {t("time.attend")}
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() => {
              skip(event);
            }}
            variant="secondary"
          >
            {t("phone.skip")}
          </Button>
        </View>
      </View>
    </View>
  );
};
