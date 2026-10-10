import type { PaceRuntime } from "#app/runtime.ts";

import { syncCalendarReminders } from "#app/platform/notifications.ts";
import { calendarKey, dismissedKeys, seriesRules } from "#app/platform/phone-memory.ts";

import { calendarToday } from "./calendar-today.ts";

/**
Today's calendar events still ahead, minus the ones waved away and the series answered for
good, each reminded about as it starts. Runs at start-up and whenever the app comes back.
*/
export const remindCalendar = async (runtime: PaceRuntime): Promise<void> => {
  const now = runtime.clock.now();
  const zone = runtime.clock.deviceTz;
  const today = await calendarToday(now, zone);
  const dismissed = await dismissedKeys();
  const rules = await seriesRules();
  const ruled = new Set(rules.map((rule) => rule.series));
  const events = today.events.filter(
    (event) =>
      !dismissed.has(calendarKey(event)) && (event.series === null || !ruled.has(event.series)),
  );
  const { language } = runtime.state.store.getState().settings;
  await syncCalendarReminders(events, { language, now, zone });
};
