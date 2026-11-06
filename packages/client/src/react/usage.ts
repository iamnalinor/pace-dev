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

/** A read over a range: its rows (kept as they were when a later read fails), and how it went. */
export type RangeRead<T> = {
  readonly rows: readonly T[];
  /** The last read failed and no rows were ever read: a zero would be a guess (QA 23 R23-08). */
  readonly isFailed: boolean;
  /** Reads it again now. */
  readonly retry: () => void;
};

/**
The list over [from, to); empty until it arrives, and kept as it was when a later read of the same
range fails. Rows are held with the range they were read for: a screen that moves to another range
in place (Day's date) never shows the last range's rows as this one's, before its read or after a
failed one (re-review N6, class 62).
*/
const useRangeRead = <T>(
  fetcher: Fetcher<T>,
  api: ApiClient,
  { from, to }: Range,
): RangeRead<T> => {
  const key = `${from}/${to}`;
  const [read, setRead] = useState<{
    readonly key: string;
    readonly rows: readonly T[];
    readonly isFailed: boolean;
  }>({ isFailed: false, key, rows: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let isCurrent = true;
    const load = async (): Promise<void> => {
      const fetched = await fetcher(api, { from, to });
      if (!isCurrent) {
        return;
      }
      setRead((previous) => {
        if (fetched !== null) {
          return { isFailed: false, key, rows: fetched };
        }
        const rows = previous.key === key ? previous.rows : [];
        return { isFailed: rows.length === 0, key, rows };
      });
    };
    void load();
    return () => {
      isCurrent = false;
    };
  }, [fetcher, api, from, to, key, attempt]);
  const isThisRange = read.key === key;
  return {
    isFailed: isThisRange && read.isFailed,
    retry: () => {
      setAttempt((count) => count + 1);
    },
    rows: isThisRange ? read.rows : [],
  };
};

const useRange = <T>(fetcher: Fetcher<T>, api: ApiClient, range: Range): readonly T[] =>
  useRangeRead(fetcher, api, range).rows;

/** App sessions on every device overlapping [from, to), with how the read went (Day). */
export const useUsageRead = (api: ApiClient, from: string, to: string): RangeRead<UsageRow> =>
  useRangeRead(usageOf, api, { from, to });

/** App sessions on every device overlapping [from, to) (Day, Week). */
export const useUsage = (api: ApiClient, from: string, to: string): readonly UsageRow[] =>
  useRange(usageOf, api, { from, to });

/** The calendar copy the phone sends, overlapping [from, to), with how the read went (Week). */
export const useCalendarRange = (
  api: ApiClient,
  from: string,
  to: string,
): RangeRead<CalendarEvent> => useRangeRead(calendarOf, api, { from, to });
