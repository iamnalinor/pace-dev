import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { SqliteValue } from "../src/shared/ports/actor-storage.ts";

import { actorDatabase, actorStorage } from "../src/platform/cloudflare/actor-storage.ts";
import { addUsage, listUsage } from "../src/user-store/cloud-data.ts";
import { usageDevices } from "../src/user-store/usage-devices.ts";
import { meterSql } from "./helpers.ts";
import { runInUserStore, UserStore } from "./host.ts";

const NOW = "2026-11-06T12:00:00.000Z";

/** The bookkeeping only an archive reads: none of it is written while no archive is bound. */
const HISTORY_TABLES = [
  "_history_raw_state",
  "_history_raw_revisions",
  "_history_archive_months",
  "_history_usage_state",
  "_history_phone_daily",
  "usage_daily_apps",
  "usage_daily_devices",
];

/** The same store with the test bucket bound as its history archive. */
const archived = (state: DurableObjectState): UserStore =>
  new UserStore(state, { ...env, HISTORY_ARCHIVE: env.TEST_HISTORY_ARCHIVE });

const zoneEvent = (id: string, timezone: string) => ({
  id,
  type: "settings.updated",
  occurredAt: NOW,
  recordedAt: NOW,
  deviceId: "fixture",
  source: "app",
  precision: "exact",
  payload: { timezone, digestWindows: [] },
});
describe("raw usage revisions and exact instants", () => {
  it("accepts a millisecond extension after a seconds-only UTC start and versions only actual changes", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (_store, state) => {
      const db = actorDatabase(state.storage);
      const storage = actorStorage(state.storage);
      const upload = {
        deviceId: "phone",
        deviceName: "Phone",
        isPhone: false,
        sessions: [
          { app: "Reader", startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T00:00:00.001Z" },
        ],
      };
      expect(await addUsage({ storage, hasArchive: true }, upload, NOW)).toBe(1);
      const rows = await listUsage(db, {
        from: "2026-01-01T00:00:00Z",
        to: "2026-01-02T00:00:00Z",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.startAt).toBe(upload.sessions[0]?.startAt);
      expect(state.storage.sql.exec("SELECT revision FROM _history_raw_state").toArray()).toEqual([
        { revision: 1 },
      ]);
      const meter = meterSql(state.storage);
      await addUsage({ storage: actorStorage(state.storage), hasArchive: true }, upload, NOW);
      expect(meter.cost().rowsWritten).toBe(0);
      meter.restore();
    });
  });
});

it("reports the actual latest device instant while preserving its source precision", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_store, state) => {
    const db = actorDatabase(state.storage);
    await addUsage(
      { storage: actorStorage(state.storage), hasArchive: true },
      {
        deviceId: "pc",
        deviceName: "PC",
        isPhone: false,
        sessions: [
          { app: "A", startAt: "2026-01-01T09:00:00Z", endAt: "2026-01-01T10:00:00Z" },
          { app: "B", startAt: "2026-01-01T09:00:00Z", endAt: "2026-01-01T10:00:00.001Z" },
        ],
      },
      NOW,
    );
    expect(await usageDevices(db)).toEqual([{ deviceId: "pc", at: "2026-01-01T10:00:00.001Z" }]);
  });
});

it("rebuilds zone-tagged aggregates when account timezone changes", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_hosted, state) => {
    const store = archived(state);
    await store.append([zoneEvent("auto:zone:1", "UTC")], { now: NOW });
    await store.addUsage(
      {
        deviceId: "pc",
        deviceName: "PC",
        isPhone: false,
        sessions: [
          { app: "Reader", startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T01:00:00Z" },
        ],
      },
      NOW,
    );
    expect(
      state.storage.sql.exec("SELECT zone,day,milliseconds FROM usage_daily_apps").toArray(),
    ).toEqual([{ zone: "UTC", day: "2026-01-01", milliseconds: 3_600_000 }]);
    await store.append([zoneEvent("auto:zone:2", "America/New_York")], { now: NOW });
    expect(
      state.storage.sql.exec("SELECT zone,day,milliseconds FROM usage_daily_apps").toArray(),
    ).toEqual([{ zone: "America/New_York", day: "2025-12-31", milliseconds: 3_600_000 }]);
  });
});

it("unions app/device/phone intervals separately and never adds overlap twice", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_store, state) => {
    const storage = actorStorage(state.storage);
    const own = { storage, hasArchive: true };
    await addUsage(
      own,
      {
        deviceId: "phone",
        deviceName: "Phone",
        isPhone: true,
        sessions: [
          { app: "A", startAt: "2026-01-01T10:00:00Z", endAt: "2026-01-01T11:00:00Z" },
          { app: "A", startAt: "2026-01-01T10:30:00Z", endAt: "2026-01-01T11:30:00Z" },
          { app: "B", startAt: "2026-01-01T10:15:00Z", endAt: "2026-01-01T10:45:00Z" },
        ],
        uses: [
          { startAt: "2026-01-01T10:00:00Z", endAt: "2026-01-01T10:40:00Z" },
          { startAt: "2026-01-01T10:20:00Z", endAt: "2026-01-01T11:00:00Z" },
        ],
      },
      NOW,
    );
    await addUsage(
      own,
      {
        deviceId: "pc",
        deviceName: "PC",
        isPhone: false,
        sessions: [{ app: "A", startAt: "2026-01-01T10:00:00Z", endAt: "2026-01-01T10:10:00Z" }],
      },
      NOW,
    );
    const apps = state.storage.sql
      .exec<{ app: string; device_id: string; milliseconds: number }>(
        "SELECT app,device_id,milliseconds FROM usage_daily_apps",
      )
      .toArray();
    expect(apps).toEqual(
      expect.arrayContaining([
        { app: "A", device_id: "phone", milliseconds: 5_400_000 },
        { app: "B", device_id: "phone", milliseconds: 1_800_000 },
        { app: "A", device_id: "pc", milliseconds: 600_000 },
      ]),
    );
    expect(apps).toHaveLength(3);
    const devices = state.storage.sql
      .exec<{ milliseconds: number }>("SELECT milliseconds FROM usage_daily_devices")
      .toArray();
    expect(devices.reduce((sum, row) => sum + Math.round(row.milliseconds / 60_000), 0)).toBe(100);
    expect(
      state.storage.sql.exec("SELECT milliseconds FROM _history_phone_daily").toArray(),
    ).toEqual([{ milliseconds: 3_600_000 }]);
  });
});

it("keeps 23-hour and 25-hour local days exact in stored derivatives", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_hosted, state) => {
    const store = archived(state);
    await store.append([zoneEvent("auto:dst-zone", "America/New_York")], { now: NOW });
    await store.addUsage(
      {
        deviceId: "pc",
        deviceName: "PC",
        isPhone: false,
        sessions: [
          { app: "Reader", startAt: "2026-03-08T05:00:00Z", endAt: "2026-03-09T04:00:00Z" },
          { app: "Reader", startAt: "2026-11-01T04:00:00Z", endAt: "2026-11-02T05:00:00Z" },
        ],
      },
      NOW,
    );
    expect(
      state.storage.sql
        .exec("SELECT day,milliseconds FROM usage_daily_apps ORDER BY day")
        .toArray(),
    ).toEqual([
      { day: "2026-03-08", milliseconds: 82_800_000 },
      { day: "2026-11-01", milliseconds: 90_000_000 },
    ]);
  });
});

it("rolls raw rows, revisions and derivatives back together after a derived write fails", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_store, state) => {
    const storage = actorStorage(state.storage);
    const failing = {
      ...storage,
      sql: {
        exec: <Row extends Record<string, SqliteValue> = Record<string, SqliteValue>>(
          query: string,
          ...bindings: SqliteValue[]
        ) => {
          if (query.startsWith("INSERT INTO usage_daily_apps")) {
            throw new Error("fixture derived write failure");
          }
          return storage.sql.exec<Row>(query, ...bindings);
        },
      },
    };
    await expect(
      addUsage(
        { storage: failing, hasArchive: true },
        {
          deviceId: "pc",
          deviceName: "PC",
          isPhone: false,
          sessions: [
            { app: "Reader", startAt: "2026-01-01T10:00:00Z", endAt: "2026-01-01T11:00:00Z" },
          ],
        },
        NOW,
      ),
    ).rejects.toThrow("fixture derived write failure");
    for (const table of [
      "usage_sessions",
      "_history_raw_state",
      "_history_raw_revisions",
      "_history_archive_months",
      "usage_daily_apps",
      "_history_usage_state",
    ]) {
      expect(state.storage.sql.exec(`SELECT * FROM ${table}`).toArray()).toHaveLength(0);
    }
    expect(await state.storage.get("usage:known:pc")).toBeUndefined();
  });
});

it("writes no history bookkeeping on an upload or a timezone change while no archive is bound", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (store, state) => {
    await store.addUsage(
      {
        deviceId: "phone",
        deviceName: "Phone",
        isPhone: true,
        sessions: [{ app: "A", startAt: "2026-01-01T10:00:00Z", endAt: "2026-01-01T11:00:00Z" }],
        uses: [{ startAt: "2026-01-01T10:00:00Z", endAt: "2026-01-01T11:00:00Z" }],
        until: "2026-01-01T11:00:00Z",
      },
      NOW,
    );
    await store.append([zoneEvent("auto:zone:no-archive", "Europe/Moscow")], { now: NOW });
    const counts = HISTORY_TABLES.map(
      (table) =>
        [table, state.storage.sql.exec(`SELECT * FROM ${table}`).toArray().length] as const,
    );
    expect(counts).toEqual(HISTORY_TABLES.map((table) => [table, 0]));
    expect(state.storage.sql.exec("SELECT * FROM usage_sessions").toArray()).toHaveLength(1);
    expect(state.storage.sql.exec("SELECT * FROM phone_uses").toArray()).toHaveLength(1);
  });
});

it("backfills a year of earlier usage in one pass over its rows when an archive is bound", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (_hosted, state) => {
    const store = archived(state);
    await store.append([zoneEvent("auto:zone:backfill", "UTC")], { now: NOW });
    const DAYS = 365;
    for (let day = 0; day < DAYS; day += 1) {
      const start = Date.parse("2025-11-01T08:00:00Z") + day * 86_400_000;
      for (const [app, offset] of [
        ["A", 0],
        ["B", 3_600_000],
        ["C", 7_200_000],
      ] as const) {
        state.storage.sql.exec(
          "INSERT INTO usage_sessions (device_id,device_name,app,start_at,end_at) VALUES ('pc','PC',?,?,?)",
          app,
          new Date(start + offset).toISOString(),
          new Date(start + offset + 1_800_000).toISOString(),
        );
      }
    }
    // The store binds `sql.exec` when it is built: one built after the meter is what it counts.
    const meter = meterSql(state.storage);
    try {
      await archived(state).addUsage(
        {
          deviceId: "pc",
          deviceName: "PC",
          isPhone: false,
          sessions: [{ app: "A", startAt: "2026-11-05T10:00:00Z", endAt: "2026-11-05T11:00:00Z" }],
        },
        NOW,
      );
      // One pass reads each source row a few times at most; a scan per day reads days × rows.
      expect(meter.cost().rowsRead).toBeLessThan(20 * DAYS * 3);
    } finally {
      meter.restore();
    }
    const days = state.storage.sql
      .exec<{ days: number; milliseconds: number }>(
        "SELECT count(DISTINCT day) AS days,sum(milliseconds) AS milliseconds FROM usage_daily_apps",
      )
      .toArray();
    expect(days).toEqual([{ days: DAYS + 1, milliseconds: (DAYS * 3 + 2) * 1_800_000 }]);
  });
});
