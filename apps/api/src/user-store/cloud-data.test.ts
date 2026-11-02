import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { UserStore } from "./user-store.ts";

import { rangeStatements } from "./cloud-data.ts";

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

const DAY_MS = 86_400_000;
/** Far ahead of the real clock, so nothing the store arms is due for the runtime (class 54). */
const NOW = "2099-10-08T12:00:00.000Z";
const FROM = new Date(Date.parse(NOW) - 1.5 * DAY_MS).toISOString();

/** How SQLite plans a statement, and how many rows it reads to answer it. */
const costOf = (sql: SqlStorage, statement: { sql: string; params: unknown[] }) => {
  const plan = Array.from(
    sql.exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${statement.sql}`, ...statement.params),
    (row) => row.detail,
  ).join(" | ");
  const cursor = sql.exec(statement.sql, ...statement.params);
  return { plan, rows: cursor.toArray().length, rowsRead: cursor.rowsRead };
};

/** A calendar event in a row's minute. */
const standup = (row: { startAt: string; endAt: string }, index: number) => ({
  ...row,
  id: `event-${String(index)}`,
  series: null,
  title: "Standup",
});

/** A minute-long row `days` before `NOW`. */
const minuteAgo = (days: number, index: number) => {
  const startAt = new Date(Date.parse(NOW) - days * DAY_MS + index * 60_000).toISOString();
  return { endAt: new Date(Date.parse(startAt) + 60_000).toISOString(), startAt };
};

describe("what the store reads of a range of its usage and calendar", () => {
  it("reads only the rows inside its window, through the end indexes, however long the history", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      // Three months of history on a laptop and a phone, and an evening inside the window.
      const old = Array.from({ length: 600 }, (_, index) => minuteAgo(90 - index / 10, index));
      const recent = Array.from({ length: 5 }, (_, index) => minuteAgo(0.5, index * 2));
      const sessions = [...old, ...recent].map((row) => ({ app: "code", ...row }));
      await instance.addUsage(
        { deviceId: "laptop", deviceName: "Mint", isPhone: false, sessions },
        NOW,
      );
      await instance.addUsage(
        {
          deviceId: "phone-1",
          deviceName: "Pixel",
          isPhone: true,
          sessions: [],
          until: NOW,
          uses: [...old, ...recent],
        },
        NOW,
      );
      const lastDay = { from: new Date(Date.parse(NOW) - DAY_MS).toISOString(), to: NOW };
      const statements = rangeStatements(instance.db, {
        from: FROM,
        phoneIds: ["phone-1"],
        range: lastDay,
      });
      for (const [query, index] of [
        [statements.otherUses, "usage_sessions_end_idx"],
        [statements.phoneUses, "phone_uses_end_idx"],
      ] as const) {
        const cost = costOf(state.storage.sql, query);
        expect(cost.plan).toContain(`USING INDEX ${index}`);
        expect(cost.rows).toBe(recent.length);
        // The rows inside the window and the one that ends it, not the 600 before.
        expect(cost.rowsRead).toBeLessThanOrEqual(recent.length + 1);
      }
      // The same holds for the person's usage list over the last day (the API, the AI apps).
      const listed = costOf(state.storage.sql, statements.usage);
      expect(listed.plan).toContain("USING INDEX usage_sessions_end_idx");
      expect(listed.rows).toBe(recent.length);
      expect(listed.rowsRead).toBeLessThanOrEqual(recent.length + 1);
    });
  });

  it("reads the calendar's range through its end, for every pass of the pool and every upload", async () => {
    await runInDurableObject(freshStore(), async (instance: UserStore, state) => {
      const old = Array.from({ length: 300 }, (_, index) => minuteAgo(90 - index / 10, index));
      const recent = Array.from({ length: 4 }, (_, index) => minuteAgo(0.2, index * 2));
      // The phone sent each range once: history outside today's range stays in the table.
      await instance.syncCalendar(
        {
          deviceId: "phone-1",
          events: old.map((row, index) => standup(row, index)),
          from: FROM.slice(0, 4),
          to: FROM,
        },
        NOW,
      );
      const today = { from: new Date(Date.parse(NOW) - DAY_MS / 2).toISOString(), to: NOW };
      await instance.syncCalendar(
        { deviceId: "phone-1", events: recent.map((row, index) => standup(row, index)), ...today },
        NOW,
      );
      const { calendar } = rangeStatements(instance.db, { from: FROM, phoneIds: [], range: today });
      const cost = costOf(state.storage.sql, calendar);
      expect(cost.plan).toContain("USING INDEX calendar_events_end_idx");
      expect(cost.rows).toBe(recent.length);
      expect(cost.rowsRead).toBeLessThanOrEqual(recent.length + 1);
      expect(await instance.calendar(today)).toHaveLength(recent.length);
    });
  });
});
