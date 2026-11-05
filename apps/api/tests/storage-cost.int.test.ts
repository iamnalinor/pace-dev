import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/shared/logger.ts";
import { UserStore } from "../src/user-store/user-store.ts";
import { coldUserStore } from "./helpers.ts";
import { COST_START, storageCostFixture } from "./storage-cost-fixture.ts";
import {
  measuredSql,
  runStorageCost,
  snapshotStorageCost,
  storageCostIdentity,
} from "./storage-cost-harness.ts";

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(COST_START));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cold cost harness initialization", () => {
  it("awaits constructor initialization before handing a cold instance to the workload", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      let isInitialized = false;
      await coldUserStore(state, env, (context, bindings) => {
        const cold = new UserStore(context, bindings);
        void context.blockConcurrencyWhile(async () => {
          await Promise.resolve();
          await Promise.resolve();
          isInitialized = true;
        });
        return cold;
      });
      expect(isInitialized).toBe(true);
    });
  });

  it("restores the runtime gate after a constructor throws", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const before: unknown = Reflect.get(state, "blockConcurrencyWhile");
      await expect(
        coldUserStore(state, env, () => {
          throw new Error("fixture constructor failure");
        }),
      ).rejects.toThrow("fixture constructor failure");
      const after: unknown = Reflect.get(state, "blockConcurrencyWhile");
      expect(after).toBe(before);
    });
  });
});

describe("storage workload fixture", () => {
  it("uses repeatable actions with distinct event and calendar identities across days", () => {
    const first = storageCostFixture({ seed: "repeatable", days: 3, history: 20 });
    expect(first).toEqual(storageCostFixture({ seed: "repeatable", days: 3, history: 20 }));
    expect(first).not.toEqual(storageCostFixture({ seed: "different", days: 3, history: 20 }));
    const events = first.flatMap((op) => (op.kind === "append" ? op.input : []));
    const ids = events.map((event) => event["id"]);
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    const calendars = first.filter(
      (op) => op.kind === "calendar" && op.id.endsWith("calendar-first"),
    );
    expect(calendars).toHaveLength(3);
    expect(
      new Set(
        calendars.flatMap((op) =>
          op.kind === "calendar" ? op.input.events.map((event) => event.id) : [],
        ),
      ).size,
    ).toBe(3);
    expect(events.filter((event) => event["type"] === "event.amended")).toHaveLength(1);
    expect(new Set(first.map((op) => op.id)).size).toBe(first.length);
  });
});

describe("measured local workloads", () => {
  it("restores the SQL meter when an operation fails", async () => {
    await runInDurableObject(freshStore(), async (_instance, { storage }) => {
      const before: unknown = Reflect.get(storage.sql, "exec");
      await expect(
        measuredSql(storage, async () => {
          throw new Error("fixture operation failure");
        }),
      ).rejects.toThrow("fixture operation failure");
      const after: unknown = Reflect.get(storage.sql, "exec");
      expect(after).toBe(before);
    });
  });

  it("replays the same seeded actions to the same final state on separate fresh stores", async () => {
    const options = { seed: "replay", days: 3, history: 20 };
    const first = await runInDurableObject(
      freshStore(),
      async (_instance, state) => await runStorageCost(state, options),
    );
    const second = await runInDurableObject(
      freshStore(),
      async (_instance, state) => await runStorageCost(state, options),
    );
    expect(first.inputIdentity).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.inputIdentity).toBe(second.inputIdentity);
    expect(first.finalIdentity).toBe(second.finalIdentity);
    expect(first.taskCount).toBe(23);
    expect(first.operationCount).toBe(22);
    createLogger("info").info("STORAGE_COST", { report: first });
  });

  it.each([
    { days: 1, history: 0 },
    { days: 1, history: 20 },
    { days: 1, history: 100 },
  ])("records a normal day with $history history rows", async (size) => {
    const report = await runInDurableObject(
      freshStore(),
      async (_instance, state) => await runStorageCost(state, { seed: "normal", ...size }),
    );
    expect(report.taskCount).toBe(size.history + size.days);
    expect(report.measurements.length).toBeGreaterThan(0);
    createLogger("info").info("STORAGE_COST", { report });
  });
});

describe("storage identity retains correction evidence", () => {
  it("keeps original and correction rows and hashes missing rows and usage cursors differently", async () => {
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const options = { seed: "evidence", days: 1, history: 0 };
      const report = await runStorageCost(state, options);
      const now = storageCostFixture(options).at(-1)?.now ?? COST_START;
      const snapshot = await snapshotStorageCost(state, now);
      expect(snapshot).toHaveProperty(
        "events",
        expect.arrayContaining([
          expect.objectContaining({ id: "auto:cost:evidence-day-0", type: "task.created" }),
          expect.objectContaining({ id: "auto:cost:evidence-amendment", type: "event.amended" }),
        ]),
      );
      const knownUsage: unknown = expect.objectContaining({ until: COST_START });
      expect(snapshot).toHaveProperty(
        "usageKnown",
        expect.objectContaining({
          "usage:known:cost-phone": knownUsage,
        }),
      );
      expect(snapshot).toHaveProperty("sequence", expect.any(Number));
      expect(await storageCostIdentity(snapshot)).toBe(report.finalIdentity);
      const events = snapshot.events;
      const missingOriginal = {
        ...snapshot,
        events: events.filter((event) => event["id"] !== "auto:cost:evidence-day-0"),
      };
      expect(await storageCostIdentity(missingOriginal)).not.toBe(report.finalIdentity);
      expect(await storageCostIdentity({ ...snapshot, usageKnown: {} })).not.toBe(
        report.finalIdentity,
      );
    });
  });
});

/** Observes a deliberately failing test operation without leaving an unhandled rejection. */
const observedFailure = async (operation: Promise<unknown>): Promise<unknown> => {
  try {
    return await operation;
  } catch (error) {
    return error;
  }
};

describe("cold initialization cleanup", () => {
  it.each(["constructor", "initialization"])(
    "drains pending work and preserves the %s failure",
    async (failureAt) => {
      await runInDurableObject(freshStore(), async (instance: UserStore) => {
        const pending = Promise.withResolvers<undefined>();
        const failure = new Error(`fixture ${failureAt} failure`);
        const fakeState = {
          blockConcurrencyWhile: async <T>(initialize: () => Promise<T>): Promise<T> =>
            await initialize(),
        } as DurableObjectState;
        const before: unknown = Reflect.get(fakeState, "blockConcurrencyWhile");
        const result = observedFailure(
          coldUserStore(fakeState, env, (context) => {
            void context.blockConcurrencyWhile(async () => {
              await pending.promise;
            });
            if (failureAt === "constructor") {
              throw failure;
            }
            void observedFailure(
              context.blockConcurrencyWhile(async () => {
                throw failure;
              }),
            );
            return instance;
          }),
        );
        try {
          for (let turn = 0; turn < 10; turn += 1) {
            await Promise.resolve();
          }
          const during: unknown = Reflect.get(fakeState, "blockConcurrencyWhile");
          expect(during).not.toBe(before);
        } finally {
          pending.resolve(undefined);
          expect(await result).toBe(failure);
        }
        const after: unknown = Reflect.get(fakeState, "blockConcurrencyWhile");
        expect(after).toBe(before);
      });
    },
  );
});
