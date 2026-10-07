import { describe, expect, it } from "vitest";

import { err, newId, ok } from "@pace/core";

import { coreValidator, normalizeEvent } from "./event-log.ts";

const NOW = "2026-10-06T10:00:00.000Z";

const event = {
  deviceId: "dev-1",
  id: newId(),
  occurredAt: "2026-10-06T09:00:00.000Z",
  payload: { fields: {}, presetId: "preset-work", subtasks: [], taskId: newId(), title: "x" },
  precision: "exact",
  recordedAt: "2026-10-06T09:00:01.000Z",
  source: "app",
  type: "task.created",
};

describe("coreValidator", () => {
  it("accepts an event the core schema knows and fills payload defaults", () => {
    const { fields: _fields, subtasks: _subtasks, ...minimal } = event.payload;
    expect(coreValidator({ ...event, payload: minimal })).toEqual(ok(event));
  });

  it("rejects an unknown event type", () => {
    const result = coreValidator({ ...event, type: "task.exploded" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/type/);
  });

  it("rejects a known type with a payload that does not fit it", () => {
    const result = coreValidator({ ...event, payload: { taskId: event.payload.taskId } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/payload\.title/);
  });

  it("rejects an id that is neither a ULID nor a deterministic system id", () => {
    expect(coreValidator({ ...event, id: "evt-1" }).ok).toBe(false);
  });
});

describe("normalizeEvent", () => {
  it("accepts a valid event unchanged", () => {
    expect(normalizeEvent(event, { now: NOW, validateEvent: coreValidator })).toEqual(ok(event));
  });

  it("clamps a recordedAt from the future to now (clock skew on the device)", () => {
    const skewed = { ...event, recordedAt: "2026-10-06T10:00:05.000Z" };
    expect(normalizeEvent(skewed, { now: NOW, validateEvent: coreValidator })).toEqual(
      ok({ ...event, recordedAt: NOW }),
    );
  });

  it("reports why a malformed envelope is rejected", () => {
    const bad = { ...event, precision: "fuzzy" };
    const result = normalizeEvent(bad, { now: NOW, validateEvent: coreValidator });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/precision/);
  });

  it("lets the caller plug a different validator", () => {
    const onlyTasks = (raw: unknown) => {
      const parsed = coreValidator(raw);
      return parsed.ok && parsed.value.type.startsWith("task.") ? parsed : err("tasks only");
    };
    expect(
      normalizeEvent({ ...event, type: "focus.started" }, { now: NOW, validateEvent: onlyTasks }),
    ).toEqual(err("tasks only"));
  });
});
