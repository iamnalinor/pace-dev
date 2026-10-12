/** What devices sent over a range, read from the server: app usage and the calendar copy. */
import { useEffect, useState } from "react";

import { type CalendarEvent, endpoints, type UsageRow } from "@pace/core";

import type { ApiClient } from "../api-client.ts";

type Range = { readonly from: string; readonly to: string };

/** One list over a range, or `null` when it cannot be read (offline). */
type Fetcher<T> = (api: ApiClient, range: Range) => Promise<null | readonly T[]>;

const usageOf: Fetcher<UsageRow> = async (api, range) => {
  try {
    const { sessions } = await api.call(endpoints.usage.list, { query: range });
    return sessions;
  } catch {
    return null;
  }
};

const calendarOf: Fetcher<CalendarEvent> = async (api, range) => {
  try {
    const { events } = await api.call(endpoints.calendar.list, { query: range });
    return events;
  } catch {
    return null;
  }
};

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
