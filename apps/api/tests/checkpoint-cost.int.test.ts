import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { actorDatabase, actorStorage } from "../src/platform/cloudflare/actor-storage.ts";
import { createLogger } from "../src/shared/logger.ts";
import { StateCache } from "../src/user-store/state-cache.ts";
import { checkpointHistory } from "./checkpoint-fixture.ts";
import { meterSql } from "./helpers.ts";
import { runInUserStore } from "./host.ts";

const log = createLogger("info");

describe("checkpoint cold-state SQL work", () => {
  it.each([1, 6, 12])(
    "measures %i synthetic months against the same off-mode source",
    async (months) => {
      const { events, now } = checkpointHistory(months);
      const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
      const measurement = await runInUserStore(stub, async (_store, state) => {
        state.storage.transactionSync(() => {
          for (const event of events) {
            state.storage.sql.exec(
              "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              event.id,
              event.type,
              event.occurredAt,
              event.recordedAt,
              event.deviceId,
              event.precision,
              event.source,
              JSON.stringify(event.payload),
            );
          }
        });
        const options = {
          build: "checkpoint-cost-v1",
          db: actorDatabase(state.storage),
          storage: actorStorage(state.storage),
          isNamed: true,
          now: () => now,
        };
        const oracle = await new StateCache(options).current();
        await new StateCache({ ...options, checkpointMode: "active" }).current();
        const measure = async (checkpointMode: "active" | "off") => {
          const meter = meterSql(state.storage);
          try {
            const value = await new StateCache({
              ...options,
              storage: actorStorage(state.storage),
              checkpointMode,
            }).current();
            return { value, cost: meter.cost() };
          } finally {
            meter.restore();
          }
        };
        const off = await measure("off");
        const active = await measure("active");
        expect(active.value).toEqual(oracle);
        expect(active.value.state.tasks.byId["old-open"]?.closed).toBeNull();
        expect(active.cost.rowsRead).toBeLessThan(off.cost.rowsRead);
        const [snapshot] = state.storage.sql
          .exec("SELECT byte_count, covered_seq, chunk_count FROM history_checkpoint")
          .toArray();
        return { months, events: events.length, off: off.cost, active: active.cost, snapshot };
      });
      log.info("checkpoint synthetic cold SQL measurement", measurement);
    },
    60_000,
  );
});
