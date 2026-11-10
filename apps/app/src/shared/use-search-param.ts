import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { usePace, useSettings } from "#app/app-state.tsx";
import { fromWallClock } from "#app/format/time.ts";
import { usePushEntry, useStepBack } from "#app/platform/push-entry.ts";
import { formatInZone } from "@pace/core";

/**
One search param of the screen's address (feedback 5 item 6: every open screen is a link): what a
person expects back after a reload (the task open beside the list, the day, the week, a filter)
lives in the address, not in React state, so a reload, a shared link and the browser's history
show the same screen. A param that is missing, repeated or empty reads as `null`; the screen checks
the rest (an unknown id, a malformed date) and falls back to its default without writing anything,
so the address never starts a loop of its own (bug-lessons 1). Setting `null` takes it off.

Every change written is a person's step (a task opened or closed, another day, week or period, a
filter picked): on the web it takes a step in the browser's history first, so Back shows what was
there before and Forward comes back (QA round 24 R24-02). Writing the value already shown does
nothing at all. `forget` is for an action that removed what the param names (a note accepted, a
task deleted): it takes the param off without a step (review of round 24, I2).

Back and Forward change the param without the screen's own setter and keep the screen mounted:
React state that only means something for one value of the param (a block picked on a day) is
stored with that value and reads as nothing for another one (bug-lessons 201).
*/
export const useSearchParam = (
  name: string,
): readonly [value: null | string, set: (next: null | string) => void, forget: () => void] => {
  const params: Readonly<Record<string, string | string[] | undefined>> = useLocalSearchParams();
  const router = useRouter();
  const pushEntry = usePushEntry();
  const didStepBack = useStepBack();
  const raw = params[name];
  const value = typeof raw === "string" && raw !== "" ? raw : null;
  const set = useCallback(
    (next: null | string): void => {
      if (next === value) {
        return;
      }
      pushEntry();
      router.setParams({ [name]: next ?? undefined });
    },
    [name, pushEntry, router, value],
  );
  // An action removed what the param names: no step, so Back does not stop on an entry whose
  // item is gone; the step that opened it is taken back where it is the one before.
  const forget = useCallback((): void => {
    if (value === null || didStepBack(name)) {
      return;
    }
    router.setParams({ [name]: undefined });
  }, [didStepBack, name, router, value]);
  return [value, set, forget];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** A calendar date as an address holds it (`2026-11-09`), or `null` for anything else. */
export const dateParam = (value: null | string): null | string => {
  if (value === null || !DATE.test(value)) {
    return null;
  }
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  // 2026-02-30 rolls over into March: only a real date survives the round trip.
  return new Date(ms).toISOString().startsWith(value) ? value : null;
};

/** An instant as an address holds it (ISO 8601 UTC), or `null` for anything else. */
export const instantParam = (value: null | string): null | string => {
  if (value === null) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) || !value.endsWith("Z") ? null : new Date(ms).toISOString();
};

/** The account's zone, as the view-models read it: the one set in Settings, else the device's. */
const useAccountZone = (): string => {
  const { timezone } = useSettings();
  const { deviceTz } = usePace().hooks.useClock();
  return timezone ?? deviceTz;
};

/**
A day (or the week holding it) in the address as its calendar date in the account's zone
(`?date=2026-10-05`): it reads back as noon of that date there, an instant inside the day
whichever zone. `null` is the default (today, this week) and takes the param off.
*/
export const useZonedDateParam = (
  name: string,
): readonly [instant: null | string, set: (next: null | string) => void] => {
  const [raw, setRaw] = useSearchParam(name);
  const zone = useAccountZone();
  const date = dateParam(raw);
  const instant = date === null ? null : fromWallClock({ date, time: "12:00", tz: zone });
  const set = useCallback(
    (next: null | string): void => {
      setRaw(next === null ? null : formatInZone(next, zone, "yyyy-MM-dd"));
    },
    [setRaw, zone],
  );
  return [instant, set];
};
