/** What devices sent over a range, read from the server: app usage and the calendar copy. */
import { useEffect, useState } from "react";

import { type CalendarEvent, endpoints, type UsageRow } from "@pace/core";

import type { ApiClient } from "../api-client.ts";

import { withinDeadline } from "../deadline.ts";

type Range = { readonly from: string; readonly to: string };

/** One list over a range, or `null` when it cannot be read (offline). */
type Fetcher<T> = (api: ApiClient, range: Range) => Promise<null | readonly T[]>;

/**
A read still on its way, by what it reads, its session and its range: two parts of one screen that
read the same range (Day's screen time and where each block sat, QA round 21 L5) share one request
(class 79). Each has a deadline, and a read of another session never joins it (class 104).
*/
const asking = new Map<string, Promise<null | readonly unknown[]>>();

const shared = <T>(
  kind: string,
  read: (api: ApiClient, range: Range, signal: AbortSignal) => Promise<readonly T[]>,
): Fetcher<T> => {
  const fetcher = async (api: ApiClient, range: Range): Promise<null | readonly T[]> => {
    const key = `${kind}/${api.currentSessionToken() ?? ""}/${range.from}/${range.to}`;
    const inFlight =
      asking.get(key) ??
      (async () => {
        try {
          return await withinDeadline(async (signal) => await read(api, range, signal));
        } catch {
          return null;
        }
      })();
    asking.set(key, inFlight);
    try {
      return (await inFlight) as null | readonly T[];
    } finally {
      asking.delete(key);
    }
  };
  return fetcher;
};

const usageOf = shared<UsageRow>("usage", async (api, range, signal) => {
  const { sessions } = await api.call(endpoints.usage.list, { query: range }, { signal });
  return sessions;
});

const calendarOf = shared<CalendarEvent>("calendar", async (api, range, signal) => {
  const { events } = await api.call(endpoints.calendar.list, { query: range }, { signal });
  return events;
});

/** The list over [from, to); empty until it arrives, and kept as it was when offline. */
const useRange = <T>(fetcher: Fetcher<T>, api: ApiClient, { from, to }: Range): readonly T[] => {
  const [rows, setRows] = useState<readonly T[]>([]);
  useEffect(() => {
    let isCurrent = true;
    const load = async (): Promise<void> => {
      const fetched = await fetcher(api, { from, to });
      if (isCurrent && fetched !== null) {
        setRows(fetched);
      }
    };
    void load();
    return () => {
      isCurrent = false;
    };
  }, [fetcher, api, from, to]);
  return rows;
};

/** App sessions on every device overlapping [from, to) (Day, Week). */
export const useUsage = (api: ApiClient, from: string, to: string): readonly UsageRow[] =>
  useRange(usageOf, api, { from, to });

/** The calendar copy the phone sends, overlapping [from, to) (Week). */
export const useCalendarRange = (
  api: ApiClient,
  from: string,
  to: string,
): readonly CalendarEvent[] => useRange(calendarOf, api, { from, to });
