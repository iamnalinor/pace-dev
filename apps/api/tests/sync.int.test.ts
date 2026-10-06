import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { err, newId } from "@pace/core";

import { coreValidator } from "../src/user-store/event-log.ts";
import { call, json, loginAsDev } from "./helpers.ts";

type PushResult = { accepted: string[]; rejected: { id: string; reason: string }[]; seq: number };
type PullResult = { events: { id: string; recordedAt: string }[]; seq: number; more: boolean };

/** A complete task.created event (defaults spelled out, so what comes back equals what went in). */
const event = (overrides: Record<string, unknown> = {}) => ({
  deviceId: "dev-1",
  id: newId(),
  occurredAt: "2026-10-06T09:00:00.000Z",
  payload: { fields: {}, presetId: "preset-work", subtasks: [], taskId: newId(), title: "t" },
  precision: "exact",
  recordedAt: "2026-10-06T09:00:01.000Z",
  source: "app",
  type: "task.created",
  ...overrides,
});

const push = async (token: string, events: unknown[]): Promise<PushResult> =>
  await json<PushResult>("/api/sync/push", { body: { events }, token });

const pull = async (token: string, query = ""): Promise<PullResult> =>
  await json<PullResult>(`/api/sync/pull${query}`, { token });

describe("sync push/pull", () => {
  it("stores events and returns them in sequence order", async () => {
    const token = await loginAsDev("1001");
    const [a, b, c] = [event(), event(), event()];
    const pushed = await push(token, [a, b, c]);
    expect(pushed).toEqual({ accepted: [a.id, b.id, c.id], rejected: [], seq: 3 });

    const pulled = await pull(token);
    expect(pulled.events.map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    expect(pulled.events[0]).toEqual(a);
    expect(pulled).toMatchObject({ more: false, seq: 3 });
  });

  it("is idempotent: re-pushing known ids accepts them without storing twice", async () => {
    const token = await loginAsDev("1001");
    const [a, b] = [event(), event()];
    const first = await push(token, [a, b]);
    const again = await push(token, [a, b, a]);
    expect(again).toEqual({ accepted: [a.id, b.id, a.id], rejected: [], seq: first.seq });
    const pulled = await pull(token, `?since=${first.seq - 2}`);
    expect(pulled.events.map((item) => item.id)).toEqual([a.id, b.id]);
  });

  it("pages with since/limit and flags whether more is left", async () => {
    const token = await loginAsDev("1001");
    const events = [event(), event(), event()];
    const { seq } = await push(token, events);
    const start = seq - 3;

    const page1 = await pull(token, `?since=${start}&limit=2`);
    expect(page1.events.map((item) => item.id)).toEqual([events[0]?.id, events[1]?.id]);
    expect(page1).toMatchObject({ more: true, seq: start + 2 });

    const page2 = await pull(token, `?since=${page1.seq}&limit=2`);
    expect(page2.events.map((item) => item.id)).toEqual([events[2]?.id]);
    expect(page2).toMatchObject({ more: false, seq });

    const empty = await pull(token, `?since=${seq}`);
    expect(empty).toEqual({ events: [], more: false, seq });
  });

  it("clamps a recordedAt from the future to the server clock", async () => {
    const token = await loginAsDev("1001");
    const skewed = event({ recordedAt: "2999-01-01T00:00:00.000Z" });
    const { seq } = await push(token, [skewed]);
    const pulled = await pull(token, `?since=${seq - 1}`);
    expect(Date.parse(pulled.events[0]?.recordedAt ?? "")).toBeLessThanOrEqual(Date.now());
  });

  it("rejects a malformed batch as a whole with 422 (contract violation)", async () => {
    const token = await loginAsDev("1001");
    const response = await call("/api/sync/push", {
      body: { events: [event(), event({ precision: "fuzzy" })] },
      token,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "validation" });
  });

  it("reports events the core schema refuses in `rejected` and keeps the rest", async () => {
    const token = await loginAsDev("1001");
    const [good, unknownType, badPayload] = [
      event(),
      event({ type: "task.exploded" }),
      event({ payload: { taskId: newId() } }),
    ];
    const pushed = await push(token, [unknownType, good, badPayload]);
    expect(pushed.accepted).toEqual([good.id]);
    expect(pushed.rejected.map((item) => item.id)).toEqual([unknownType.id, badPayload.id]);
    expect(pushed.rejected[0]?.reason).toMatch(/type/);
    expect(pushed.rejected[1]?.reason).toMatch(/payload\.title/);
    const pulled = await pull(token, `?since=${pushed.seq - 1}`);
    expect(pulled.events.map((item) => item.id)).toEqual([good.id]);
  });

  it("keeps users apart: one never sees the other's events", async () => {
    const [alice, bob] = [await loginAsDev("1001"), await loginAsDev("1002")];
    const mine = event();
    await push(alice, [mine]);
    const theirs = await pull(bob);
    expect(theirs.events.map((item) => item.id)).not.toContain(mine.id);
  });
});

describe("UserStore.append validation seam", () => {
  it("rejects what the validator refuses without aborting the rest of the batch", async () => {
    const id = env.USER_STORE.idFromName(`seam-${crypto.randomUUID()}`);
    const stub = env.USER_STORE.get(id);
    const [good, bad] = [event(), event({ type: "focus.started" })];
    const result = await runInDurableObject(
      stub,
      async (instance) =>
        await instance.append([bad, good], {
          now: "2026-10-06T10:00:00.000Z",
          validateEvent: (raw) => {
            const parsed = coreValidator(raw);
            return parsed.ok && parsed.value.type !== "focus.started" ? parsed : err("tasks only");
          },
        }),
    );
    expect(result).toEqual({
      accepted: [good.id],
      rejected: [{ id: bad.id, reason: "tasks only" }],
      seq: 1,
    });
  });
});

describe("sync observations", () => {
  it("stores observations once per kind+key", async () => {
    const token = await loginAsDev("1002");
    const observation = {
      at: "2026-10-06T08:00:00.000Z",
      key: `usage:${crypto.randomUUID()}`,
      kind: "usage_stats",
      payload: { minutes: 12 },
    };
    const first = await json("/api/sync/observations", {
      body: { observations: [observation, { ...observation, kind: "calendar_events" }] },
      token,
    });
    expect(first).toEqual({ accepted: 2 });
    const again = await json("/api/sync/observations", {
      body: { observations: [observation] },
      token,
    });
    expect(again).toEqual({ accepted: 0 });
  });
});
