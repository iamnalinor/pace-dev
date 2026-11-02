import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import type { PhoneCalendarEvent } from "#app/platform/phone-calendar.ts";

import { useAppState, usePace } from "#app/app-state.tsx";
import {
  calendarKey,
  dismissedKeys,
  seriesRules,
  usePhoneMemoryVersion,
} from "#app/platform/phone-memory.ts";
import { useFeed } from "#app/shared/notifications/use-feed.ts";
import { useLatestLoad, usePhoneAnswers } from "#app/shared/tracking/use-phone-answers.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { eventAnswers } from "@pace/client";
import { calendarEventKey } from "@pace/core";

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
not read yet), minus the occurrences answered on any channel (the notification pool), and its
Skip, which waves that occurrence away here and on every channel.
*/
export const useCalendarPrompt = (): {
  readonly event: null | PhoneCalendarEvent;
  /** `false` (and still offered) when the server did not take the skip. */
  readonly skip: (event: PhoneCalendarEvent) => Promise<boolean>;
} => {
  const { api, clock, notifications } = usePace();
  const { items } = useFeed();
  const answered = useMemo(() => eventAnswers(items), [items]);
  const { deviceTz, now } = useViewer();
  const activities = useAppState((state) => state.time.activities);
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  // Read again when Day (or Settings) changes what the phone remembers.
  const memory = usePhoneMemoryVersion();
  const loadLatest = useLatestLoad(setLoaded);
  const reload = useCallback(() => {
    loadLatest(async () => {
      const today = await calendarToday({ api, now: clock.now(), zone: deviceTz });
      const rules = await seriesRules();
      return {
        dismissed: await dismissedKeys(),
        events: today.events,
        ruled: new Set(rules.map((rule) => rule.series)),
      };
    });
  }, [loadLatest, api, clock, deviceTz]);
  const answeredHere = usePhoneAnswers(reload);
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
  }, [reload, memory]);
  // What was answered here this session holds whatever the phone's storage did with it.
  const known: Loaded = {
    dismissed: new Set([...loaded.dismissed, ...answeredHere.dismissed]),
    events: loaded.events,
    ruled: new Set([...loaded.ruled, ...answeredHere.rules.map((rule) => rule.series)]),
  };
  const offered = promptedEvent(
    known.events.filter((event) => !answered.has(calendarEventKey(event))),
    now,
    { ...known, activities: Object.values(activities) },
  );
  return {
    event: offered,
    skip: async (event) => {
      // Hidden only once the server took it: a skip that did not go through stays to tap again.
      if (!(await notifications.skipEvent(calendarEventKey(event)))) {
        return false;
      }
      // Gone at once; the phone's storage (slow on Android) follows.
      answeredHere.dismiss(calendarKey(event));
      return true;
    },
  };
};
