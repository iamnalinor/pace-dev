import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import type { PhoneCalendarEvent } from "#app/platform/phone-calendar.ts";

import { useAppState, usePace } from "#app/app-state.tsx";
import { calendarKey, dismiss, dismissedKeys, seriesRules } from "#app/platform/phone-memory.ts";
import { useViewer } from "#app/shared/use-viewer.ts";

import { calendarToday } from "./calendar-source.ts";
import { promptedEvent } from "./calendar-today.ts";

/** The calendar is read again this often while Now is open (and whenever the app comes back). */
const RELOAD_MS = 5 * 60_000;

type Loaded = {
  readonly events: readonly PhoneCalendarEvent[];
  readonly dismissed: ReadonlySet<string>;
  readonly ruled: ReadonlySet<string>;
};

const EMPTY: Loaded = { dismissed: new Set(), events: [], ruled: new Set() };

/**
The calendar event Now offers "Attend or skip?" for (none on the web, where the calendar is
not read yet), and its Skip, which waves that occurrence away on this phone.
*/
export const useCalendarPrompt = (): {
  readonly event: null | PhoneCalendarEvent;
  readonly skip: (event: PhoneCalendarEvent) => void;
} => {
  const { api, clock } = usePace();
  const { deviceTz, now } = useViewer();
  const activities = useAppState((state) => state.time.activities);
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const reload = useCallback(() => {
    void (async () => {
      const today = await calendarToday({ api, now: clock.now(), zone: deviceTz });
      const rules = await seriesRules();
      setLoaded({
        dismissed: await dismissedKeys(),
        events: today.events,
        ruled: new Set(rules.map((rule) => rule.series)),
      });
    })();
  }, [api, clock, deviceTz]);
  useEffect(() => {
    reload();
    const timer = setInterval(reload, RELOAD_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        reload();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [reload]);
  return {
    event: promptedEvent(loaded.events, now, { ...loaded, activities: Object.values(activities) }),
    skip: (event) => {
      void (async () => {
        await dismiss(calendarKey(event));
        reload();
      })();
    },
  };
};
