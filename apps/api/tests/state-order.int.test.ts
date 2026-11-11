import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { coreReducer, type Event, INITIAL_CORE_STATE, materialize } from "@pace/core";

import { runInUserStore } from "./host.ts";

const NOW = "2026-10-06T10:00:00.000Z";
const setting = (id: string, language: "en" | "ru"): Event => ({
  deviceId: "phone",
  id,
  occurredAt: NOW,
  payload: { language },
  precision: "exact",
  recordedAt: NOW,
  source: "app",
  type: "settings.updated",
});

describe("canonical order across server batches", () => {
  it("keeps a warm store consistent with a full rebuild after a lower same-time id arrives", async () => {
    const high = setting("01ARZ3NDEKTSV4RRFFQ69G5FAB", "ru");
    const low = setting("01ARZ3NDEKTSV4RRFFQ69G5FAA", "en");
    const stub = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInUserStore(stub, async (store) => {
      expect(await store.append([high], { now: NOW })).toMatchObject({ accepted: [high.id] });
      expect((await store.read(NOW)).state.settings.language).toBe("ru");
      expect(await store.append([low], { now: NOW })).toMatchObject({ accepted: [low.id] });

      const current = await store.read(NOW);
      const rebuilt = materialize([high, low], coreReducer, INITIAL_CORE_STATE);
      expect(rebuilt.settings.language).toBe("ru");
      expect(current.state.settings).toEqual(rebuilt.settings);
    });
  });
});
