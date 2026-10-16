import { describe, expect, it } from "vitest";

import { addDaysIn, newId, seriesInstanceId } from "@pace/core";

import { json, loginAsDev, pushEvents } from "./helpers.ts";

describe("recurring series sync", () => {
  it("derives one future instance from an existing independent repeat task", async () => {
    const token = await loginAsDev("1001");
    const now = new Date().toISOString();
    const startAt = addDaysIn(now, -1, "UTC");
    const seriesId = newId();
    const firstId = seriesInstanceId(seriesId, 0, 0);
    const template = {
      taskId: firstId,
      title: "Read",
      presetId: "personal",
      seriesId,
      seriesRevision: 0,
      startAt,
      startTz: "UTC",
      subtasks: [],
      fields: {},
    };
    const envelope = {
      occurredAt: now,
      recordedAt: now,
      deviceId: "test",
      precision: "exact",
      source: "app",
    };
    const answer = await pushEvents<{ accepted: string[] }>(token, [
      {
        ...envelope,
        id: newId(),
        type: "series.created",
        payload: { seriesId, schedule: { kind: "daily" }, template },
      },
      { ...envelope, id: firstId, source: "system", type: "task.created", payload: template },
    ]);
    expect(answer.accepted).toHaveLength(2);
    const pull = await json<{
      events: { type: string; payload: { seriesId?: string; startAt?: string } }[];
    }>("/api/sync/pull", { token });
    const tasks = pull.events.filter(
      (event) => event.type === "task.created" && event.payload.seriesId === seriesId,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.filter((event) => (event.payload.startAt ?? "") > now)).toHaveLength(1);
  });
});
