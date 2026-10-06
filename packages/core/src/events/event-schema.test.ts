import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { newId } from "../ids.ts";
import { EVENT_TYPES, type Event, type EventInput, EventSchema, parseEvent } from "./event-schema.ts";

const envelope = {
  deviceId: "device-1",
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  occurredAt: "2026-10-06T10:00:00.000Z",
  precision: "exact",
  recordedAt: "2026-10-06T10:00:01.000Z",
  source: "app",
} as const;

const created = {
  ...envelope,
  payload: {
    dueAt: "2026-10-08T16:00:00.000Z",
    dueTz: "Europe/Moscow",
    presetId: "preset-work",
    subtasks: [{ id: "s1", label: "Write the summary", number: 1 }],
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    title: "Quarterly report",
  },
  type: "task.created",
} as const;

describe("parseEvent", () => {
  it("round-trips a valid task.created event and fills defaults", () => {
    const result = parseEvent(created);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        ...created,
        payload: { ...created.payload, fields: {} },
      });
    }
  });

  it("rejects an unknown type", () => {
    const result = parseEvent({ ...envelope, payload: {}, type: "task.exploded" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("type");
    }
  });

  it("rejects an id that is neither a ULID nor a deterministic system id", () => {
    expect(parseEvent({ ...created, id: "not-an-id" }).ok).toBe(false);
    expect(parseEvent({ ...created, id: "hw:preset-work:2026-W41" }).ok).toBe(true);
    expect(parseEvent({ ...created, id: "auto:01ARZ3NDEKTSV4RRFFQ69G5FAW:missed" }).ok).toBe(true);
  });

  it("requires UTC ISO instants", () => {
    expect(parseEvent({ ...created, occurredAt: "2026-10-06 10:00" }).ok).toBe(false);
    expect(parseEvent({ ...created, occurredAt: "2026-10-06T12:00:00+02:00" }).ok).toBe(false);
    expect(parseEvent({ ...created, recordedAt: "yesterday" }).ok).toBe(false);
  });

  it("rejects unknown precision and source", () => {
    expect(parseEvent({ ...created, precision: "fuzzy" }).ok).toBe(false);
    expect(parseEvent({ ...created, source: "fax" }).ok).toBe(false);
  });

  it("requires a zone next to a due or start instant", () => {
    const { dueTz: _dueTz, ...withoutTz } = created.payload;
    expect(parseEvent({ ...created, payload: withoutTz }).ok).toBe(false);
    expect(
      parseEvent({
        ...created,
        payload: { ...created.payload, startAt: "2026-10-07T08:00:00.000Z" },
      }).ok,
    ).toBe(false);
    expect(parseEvent({ ...created, payload: { ...created.payload, dueTz: "Mars/Olympus" } }).ok).toBe(
      false,
    );
  });

  it("reports the failing path", () => {
    const result = parseEvent({
      ...envelope,
      payload: { progress: 11, taskId: "t" },
      type: "task.progress.set",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("payload.progress");
    }
  });

  it("validates settings.updated partially", () => {
    const base = { ...envelope, type: "settings.updated" } as const;
    expect(parseEvent({ ...base, payload: { language: "ru" } }).ok).toBe(true);
    expect(parseEvent({ ...base, payload: { digestWindows: ["09:00", "21:30"] } }).ok).toBe(true);
    expect(parseEvent({ ...base, payload: { digestWindows: ["25:00"] } }).ok).toBe(false);
    expect(parseEvent({ ...base, payload: { language: "de" } }).ok).toBe(false);
    expect(parseEvent({ ...base, payload: { quietHours: { from: "23:00", to: "08:00" } } }).ok).toBe(
      true,
    );
    expect(parseEvent({ ...base, payload: { timezone: "Nowhere/Land" } }).ok).toBe(false);
  });

  it("keeps preset definitions opaque", () => {
    const result = parseEvent({
      ...envelope,
      payload: {
        definition: { policy: "pace", anything: [1, 2, 3] },
        extends: "preset-work",
        id: "preset-hw",
        name: "Homework",
      },
      type: "preset.created",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts corrections", () => {
    const amended = parseEvent({
      ...envelope,
      payload: { patch: { title: "Renamed" }, targetId: created.id },
      type: "event.amended",
    });
    const revoked = parseEvent({
      ...envelope,
      payload: { targetId: created.id },
      type: "event.revoked",
    });
    expect(amended.ok).toBe(true);
    expect(revoked.ok).toBe(true);
  });

  it("accepts the task lifecycle payloads", () => {
    const taskId = created.payload.taskId;
    const cases: ReadonlyArray<readonly [Event["type"], unknown]> = [
      ["task.updated", { taskId, title: "New title" }],
      ["task.preset.set", { presetId: "preset-hw", taskId }],
      ["task.overrides.set", { overrides: { softDays: 2 }, taskId }],
      ["task.status.set", { status: "in_progress", taskId }],
      ["task.subtask.solved", { subtaskId: "s1", taskId }],
      ["task.subtasks.added", { subtasks: [{ id: "s2", label: "Second" }], taskId }],
      ["task.submitted", { closes: true, subtaskIds: ["s1"], taskId }],
      ["task.submitted", { taskId }],
      ["task.closed", { outcome: "cancelled_missed", reason: "Too late", taskId }],
      ["task.reopened", { taskId }],
      ["task.importance.set", { importance: "asap", taskId }],
      ["task.project.set", { projectId: null, taskId }],
      ["task.progress.set", { progress: 10, taskId }],
      ["task.estimate.set", { estimateMinutes: 90, taskId }],
      ["task.rank.set", { rank: 0, taskId }],
      ["task.source.attached", { sourceText: "From Telegram", taskId }],
      ["project.created", { color: "blue", name: "Work", projectId: "p1" }],
      ["project.updated", { archived: true, projectId: "p1" }],
      ["preset.updated", { definition: { policy: "lag" }, id: "preset-hw" }],
      ["preset.archived", { id: "preset-hw" }],
      ["focus.started", { taskId }],
      ["focus.ended", { taskId }],
    ];
    for (const [type, payload] of cases) {
      const result = parseEvent({ ...envelope, payload, type });
      expect(result, type).toEqual(expect.objectContaining({ ok: true }));
    }
  });

  it("rejects wrong enum values in lifecycle payloads", () => {
    const taskId = created.payload.taskId;
    expect(parseEvent({ ...envelope, payload: { status: "done", taskId }, type: "task.status.set" }).ok).toBe(false);
    expect(parseEvent({ ...envelope, payload: { outcome: "won", taskId }, type: "task.closed" }).ok).toBe(false);
    expect(parseEvent({ ...envelope, payload: { importance: "urgent", taskId }, type: "task.importance.set" }).ok).toBe(false);
    expect(parseEvent({ ...envelope, payload: { color: "octarine", name: "X", projectId: "p" }, type: "project.created" }).ok).toBe(false);
    expect(parseEvent({ ...envelope, payload: { subtasks: [], taskId }, type: "task.subtasks.added" }).ok).toBe(false);
  });

  it("parses any generated envelope", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: Date.UTC(2030, 0, 1), min: Date.UTC(2020, 0, 1) }),
        fc.constantFrom("exact", "approx"),
        fc.constantFrom("app", "web", "bot", "mcp", "system"),
        (ms, precision, source) => {
          const at = new Date(ms).toISOString();
          const result = parseEvent({
            deviceId: "d",
            id: newId(ms),
            occurredAt: at,
            payload: { taskId: "t" },
            precision,
            recordedAt: at,
            source,
            type: "task.reopened",
          });
          expect(result.ok).toBe(true);
        },
      ),
    );
  });
});

describe("EVENT_TYPES", () => {
  it("matches the discriminated union", () => {
    const fromSchema = EventSchema.options.map((option) => option.shape.type.value);
    expect([...EVENT_TYPES].sort((a, b) => a.localeCompare(b))).toEqual(
      [...fromSchema].sort((a, b) => a.localeCompare(b)),
    );
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  it("covers every stage-1 type from the plan", () => {
    expect(EVENT_TYPES).toHaveLength(26);
  });
});

describe("EventInput", () => {
  it("lets the envelope fields be omitted", () => {
    const input: EventInput = {
      occurredAt: "2026-10-06T10:00:00.000Z",
      payload: { taskId: "t" },
      precision: "exact",
      source: "app",
      type: "task.reopened",
    };
    expect(input.type).toBe("task.reopened");
  });
});
