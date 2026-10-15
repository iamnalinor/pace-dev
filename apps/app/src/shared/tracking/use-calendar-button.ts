import { useEffect, useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";

import { calendarToday } from "./calendar-source.ts";
import {
  type CalendarButtonState,
  calendarButtonState,
  type CalendarToday,
} from "./calendar-today.ts";

type CalendarRead = {
  /** Today's calendar; null until the first read. */
  readonly today: CalendarToday | null;
  /** Reads it again now (access granted or an event added since) and keeps the answer. */
  readonly refresh: () => Promise<CalendarToday>;
};

/**
Today's calendar, read when the bar shows and again every ten minutes of the clock (whether an
event is near is worked out from it at every tick), or at once on `refresh`.
*/
const useCalendarToday = (): CalendarRead => {
  const { api } = usePace();
  const { deviceTz, now } = useViewer();
  const [today, setToday] = useState<CalendarToday | null>(null);
  // "2026-10-12T19:4": changes every ten minutes.
  const tenMinutes = now.slice(0, 15);
  useEffect(() => {
    // Gone (or read again) before the answer came: that answer is dropped.
    const read = { isLive: true };
    void (async () => {
      const fresh = await calendarToday({ api, now: `${tenMinutes}0:00.000Z`, zone: deviceTz });
      if (read.isLive) {
        setToday(fresh);
      }
    })();
    return () => {
      read.isLive = false;
    };
  }, [api, deviceTz, tenMinutes]);
  const refresh = async (): Promise<CalendarToday> => {
    const fresh = await calendarToday({ api, now, zone: deviceTz });
    setToday(fresh);
    return fresh;
  };
  return { refresh, today };
};

const UNAVAILABLE_KEY = {
  loading: "time.calendar.loading",
  noAccess: "time.calendar.noAccess",
  nothingNear: "time.calendar.nothingNear",
} as const;

export type CalendarButton = {
  /**
  Today's calendar for the picker. Read again while the button is greyed: access may have
  been granted, or an event added, since the last read.
  */
  readonly forPicker: () => Promise<CalendarToday>;
  /** Why it cannot link anything now (the button is greyed, its tooltip says it), or undefined. */
  readonly unavailable: string | undefined;
};

/** The Calendar button of the time bar: whether an event is near, and today's calendar for its picker. */
export const useCalendarButton = (): CalendarButton => {
  const t = useT();
  const { now } = useViewer();
  const { refresh, today } = useCalendarToday();
  const shown: CalendarButtonState = calendarButtonState(today, now);
  return {
    forPicker: async () => (today !== null && shown.kind === "ready" ? today : await refresh()),
    unavailable: shown.kind === "ready" ? undefined : t(UNAVAILABLE_KEY[shown.kind]),
  };
};
