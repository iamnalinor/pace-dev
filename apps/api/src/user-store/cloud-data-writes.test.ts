import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { meterSql } from "../../tests/helpers.ts";
import { runInUserStore as runInDurableObject, type UserStore } from "../../tests/host.ts";
import { addUsage, type UsageUpload } from "./cloud-data.ts";
import { phoneUses, usageSessions } from "./schema.ts";

const NOW = "2099-10-08T12:00:00.000Z";
const START = "2099-01-01T10:00:00.000Z";
const END = "2099-01-01T11:00:00.000Z";
const SHORTER = "2099-01-01T10:30:00.000Z";
const LATER = "2099-01-01T12:00:00.000Z";

const uploadOf = (endAt: string, deviceName = "Pixel"): UsageUpload => ({
  deviceId: "phone",
  deviceName,
  isPhone: true,
  sessions: [{ app: "reader", startAt: START, endAt }],
  uses: [{ startAt: START, endAt }],
});

describe("usage upload SQL writes", () => {
  it("accepts repeated and shorter historical uploads without rewriting either raw table", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const host = { storage: state.storage, hasArchive: true };
      expect(await addUsage(host, uploadOf(END), NOW)).toBe(2);
      const meter = meterSql(state.storage);
      try {
        expect(await addUsage(host, uploadOf(END), NOW)).toBe(2);
        expect(await addUsage(host, uploadOf(SHORTER), NOW)).toBe(2);
        expect(meter.cost().rowsWritten).toBe(0);
      } finally {
        meter.restore();
      }
      expect(await instance.db.select().from(usageSessions)).toEqual([
        { app: "reader", deviceId: "phone", deviceName: "Pixel", startAt: START, endAt: END },
      ]);
      expect(await instance.db.select().from(phoneUses)).toEqual([
        { deviceId: "phone", startAt: START, endAt: END },
      ]);
      const extension = meterSql(state.storage);
      try {
        expect(await addUsage(host, uploadOf(LATER), NOW)).toBe(2);
        expect(extension.cost().rowsWritten).toBeGreaterThan(0);
      } finally {
        extension.restore();
      }
      expect(await instance.db.select().from(usageSessions)).toMatchObject([{ endAt: LATER }]);
      expect(await instance.db.select().from(phoneUses)).toMatchObject([{ endAt: LATER }]);
    });
  });

  it("keeps device renames from shorter uploads without shortening a session", async () => {
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(stub, async (instance: UserStore, state) => {
      const host = { storage: state.storage, hasArchive: true };
      await addUsage(host, uploadOf(END), NOW);
      expect(await addUsage(host, uploadOf(SHORTER, "Renamed phone"), NOW)).toBe(2);
      expect(await instance.db.select().from(usageSessions)).toEqual([
        {
          app: "reader",
          deviceId: "phone",
          deviceName: "Renamed phone",
          startAt: START,
          endAt: END,
        },
      ]);
    });
  });
});
