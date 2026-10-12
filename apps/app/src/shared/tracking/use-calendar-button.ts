import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { usePace, useT } from "#app/app-state.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useToast } from "#app/ui/toast.tsx";

import { calendarToday } from "./calendar-source.ts";
import {
  type CalendarButtonState,
  calendarButtonState,
  type CalendarToday,
} from "./calendar-today.ts";

/**
Today's calendar, read when the bar shows and again every ten minutes of the clock (whether an
event is near is worked out from it at every tick); null until the first read.
*/
const useCalendarToday = (): CalendarToday | null => {
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
  return today;
};

const UNAVAILABLE_KEY = {
  loading: "time.calendar.loading",
  noAccess: "time.calendar.noAccess",
  nothingNear: "time.calendar.nothingNear",
} as const;

export type CalendarButton = {
  /** Today's calendar for the picker (null until read). */
  readonly today: CalendarToday | null;
  /** Why it cannot link anything now (the button is greyed), or undefined. */
  readonly unavailable: string | undefined;
  /**
  A tap: the one event near now starts; several open the picker; none (or no access) explains
  in a toast what the button is and why not now.
  */
  readonly tap: (openPicker: () => void) => Promise<void>;
};

/** The Calendar button of the time bar: whether an event is near, and what a tap does. */
export const useCalendarButton = (): CalendarButton => {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const { actions } = usePace();
  const run = useRunAction();
  const { now } = useViewer();
  const today = useCalendarToday();
  const state: CalendarButtonState = calendarButtonState(today, now);
  const why = state.kind === "ready" ? undefined : t(UNAVAILABLE_KEY[state.kind]);
  const explain = (reason: string): void => {
    toast.show({
      ...(state.kind === "noAccess" && {
        action: {
          label: t("permissions.title"),
          onPress: () => {
            router.push("/permissions");
          },
        },
      }),
      message: `${t("time.calendar.what")} ${reason}`,
    });
  };
  return {
    tap: async (openPicker) => {
      if (state.kind !== "ready") {
        explain(why ?? "");
        return;
      }
      const [only, ...others] = state.events;
      if (only !== undefined && others.length === 0) {
        await run(actions.startCalendar(only));
        return;
      }
      openPicker();
    },
    today,
    unavailable: why,
  };
};
