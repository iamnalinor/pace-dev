import { describe, expect, it } from "vitest";

import { endpoints, newId } from "@pace/core";

import { answerOf, call, loginAsDev, pushEvents, storeIdOf } from "./helpers.ts";

const setting = () => ({
  deviceId: "history-route-test",
  id: newId(),
  occurredAt: "2026-01-01T00:00:00.000Z",
  recordedAt: "2026-01-01T00:00:00.000Z",
  precision: "exact",
  source: "app",
  type: "settings.updated",
  payload: { language: "en" },
});

describe("checkpoint history HTTP contract", () => {
  it("requires authentication and explicitly chooses retained source when checkpoints are off", async () => {
    expect((await call("/api/sync/bootstrap")).status).toBe(401);
    const token = await loginAsDev("1001");
    const generation = await storeIdOf(token);
    expect(
      await answerOf(endpoints.sync.bootstrap, "/api/sync/bootstrap?limit=1", { token }),
    ).toEqual({ kind: "source", storeId: generation });
    expect((await call("/api/sync/bootstrap?limit=0", { token })).status).toBe(422);
  });

  it("pins complete history while later writes remain available to ordinary sync", async () => {
    const token = await loginAsDev("1001");
    const first = setting();
    const second = setting();
    const { seq: through } = await pushEvents<{ seq: number }>(token, [first, second]);
    const storeId = await storeIdOf(token);
    const late = setting();
    const { seq: latest } = await pushEvents<{ seq: number }>(token, [late]);
    const prefix = `/api/sync/pull?checkpointVersion=1&storeId=${storeId}&through=${through}`;
    const page = await answerOf(endpoints.sync.pull, `${prefix}&limit=1`, { token });
    expect(page).toMatchObject({ more: true, records: [{ seq: 1, event: { id: first.id } }] });
    expect(page.bootstrapRequired).toBeUndefined();
    const last = await answerOf(endpoints.sync.pull, `${prefix}&since=${page.seq}`, { token });
    expect(last).toMatchObject({
      seq: through,
      more: false,
      records: [{ seq: through, event: { id: second.id } }],
    });
    const tail = await answerOf(
      endpoints.sync.pull,
      `/api/sync/pull?checkpointVersion=1&storeId=${storeId}&since=${through}`,
      { token },
    );
    expect(tail).toMatchObject({
      seq: latest,
      more: false,
      records: [{ seq: latest, event: { id: late.id } }],
    });
    const settled = await answerOf(
      endpoints.sync.pull,
      `/api/sync/pull?checkpointVersion=1&storeId=${storeId}&since=${latest}`,
      { token },
    );
    expect(settled).toMatchObject({ records: [], events: [], seq: latest, more: false });
  });

  it("maps generation changes and invalid pinned bounds to stable client errors", async () => {
    const token = await loginAsDev("1001");
    const changed = await call("/api/sync/pull?checkpointVersion=1&storeId=old-copy&through=0", {
      token,
    });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: "store/changed" });
    for (const query of ["since=2&through=1", "since=0&through=99"]) {
      const invalid = await call(`/api/sync/pull?checkpointVersion=1&${query}`, { token });
      expect(invalid.status).toBe(422);
      expect(await invalid.json()).toMatchObject({ code: "sync/invalid-cursor" });
    }
  });
});
