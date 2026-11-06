import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type { SqliteValue } from "../src/shared/ports/actor-storage.ts";

import { actorDatabase, actorStorage } from "../src/platform/cloudflare/actor-storage.ts";
import { addUsage, listUsage } from "../src/user-store/cloud-data.ts";
import { usageDevices } from "../src/user-store/usage-devices.ts";
import { meterSql } from "./helpers.ts";
import { runInUserStore } from "./host.ts";

const NOW = "2026-11-06T12:00:00.000Z";
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
      expect(await addUsage({ db, storage }, upload, NOW)).toBe(1);
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
      await addUsage({ db, storage: actorStorage(state.storage) }, upload, NOW);
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
      { db, storage: actorStorage(state.storage) },
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
  await runInUserStore(stub, async (store, state) => {
    const settings = (id: string, timezone: string) => ({
      id,
      type: "settings.updated",
      occurredAt: NOW,
      recordedAt: NOW,
      deviceId: "fixture",
      source: "app",
      precision: "exact",
      payload: { timezone, digestWindows: [] },
    });
    await store.append([settings("auto:zone:1", "UTC")], { now: NOW });
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
    await store.append([settings("auto:zone:2", "America/New_York")], { now: NOW });
    expect(
      state.storage.sql.exec("SELECT zone,day,milliseconds FROM usage_daily_apps").toArray(),
    ).toEqual([{ zone: "America/New_York", day: "2025-12-31", milliseconds: 3_600_000 }]);
  });
});

it("unions app/device/phone intervals separately and never adds overlap twice", async () => {
  const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
  await runInUserStore(stub, async (store, state) => {
    const storage = actorStorage(state.storage);
    const own = { db: store.db, storage };
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
  await runInUserStore(stub, async (store, state) => {
    await store.append(
      [
        {
          id: "auto:dst-zone",
          type: "settings.updated",
          occurredAt: NOW,
          recordedAt: NOW,
          deviceId: "fixture",
          source: "app",
          precision: "exact",
          payload: { timezone: "America/New_York", digestWindows: [] },
        },
      ],
      { now: NOW },
    );
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
  await runInUserStore(stub, async (store, state) => {
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
        { db: store.db, storage: failing },
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
