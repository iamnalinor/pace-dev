import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { type EventInput, newId } from "@pace/core";

import type { UserStore } from "../src/user-store/user-store.ts";

import * as schema from "../src/user-store/schema.ts";

const NOW = "2026-10-07T12:00:00.000Z";
const EARLIER = "2026-10-07T09:00:00.000Z";
const SOLVED_AT = "2026-10-07T10:00:00.000Z";

type Raw = Record<string, unknown>;

const envelope = (type: string, payload: Raw, overrides: Raw = {}): Raw => ({
  deviceId: "dev-1",
  id: newId(),
  occurredAt: EARLIER,
  payload,
  precision: "exact",
  recordedAt: EARLIER,
  source: "app",
  type,
  ...overrides,
});

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

const taskCreated = (taskId: string, extra: Raw = {}): Raw =>
  envelope("task.created", {
    presetId: "hw",
    subtasks: [
      { id: "s1", label: "1", number: 1 },
      { id: "s2", label: "2", number: 2 },
    ],
    taskId,
    title: "Sheet 3",
    ...extra,
  });

describe("projections", () => {
  it("writes task, subtask and project rows that match the materialized state", async () => {
    const stub = freshStore();
    const taskId = newId();
    const projectId = newId();
    const solve = envelope(
      "task.subtask.solved",
      { subtaskId: "s1", taskId },
      { occurredAt: SOLVED_AT },
    );
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append(
        [
          envelope("project.created", { color: "blue", name: "Algebra", projectId }),
          taskCreated(taskId, {
            dueAt: "2026-10-09T20:59:00.000Z",
            dueTz: "Europe/Moscow",
            projectId,
          }),
          solve,
        ],
        { now: NOW },
      );
      const [task] = await instance.db.select().from(schema.tasks);
      expect(task).toMatchObject({
        id: taskId,
        importance: "normal",
        outcome: null,
        presetId: "hw",
        progress: 0.5,
        projectId,
        status: "in_progress",
        title: "Sheet 3",
        touched: true,
      });
      const subtasks = await instance.db.select().from(schema.subtasks);
      expect(subtasks.map((row) => [row.id, row.number, row.solvedAt])).toEqual([
        ["s1", 1, SOLVED_AT],
        ["s2", 2, null],
      ]);
      const [project] = await instance.db.select().from(schema.projects);
      expect(project).toMatchObject({
        archived: false,
        color: "blue",
        id: projectId,
        name: "Algebra",
      });
      const presets = await instance.db.select().from(schema.presets);
      expect(presets.map((row) => row.id)).toContain("hw");
    });
  });

  it("rewrites the rows after a revoke (a revoked solve is undone in SQL too)", async () => {
    const stub = freshStore();
    const taskId = newId();
    const solve = envelope(
      "task.subtask.solved",
      { subtaskId: "s1", taskId },
      { occurredAt: SOLVED_AT },
    );
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([taskCreated(taskId), solve], { now: NOW });
      await instance.append([envelope("event.revoked", { targetId: solve["id"] })], { now: NOW });
      const rows = await instance.db.select().from(schema.subtasks);
      expect(rows.find((row) => row.id === "s1")?.solvedAt).toBeNull();
      const [task] = await instance.db.select().from(schema.tasks);
      expect(task?.progress).toBe(0);
    });
  });

  it("rebuilds from storage when the in-memory cache is empty", async () => {
    const stub = freshStore();
    const taskId = newId();
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append([taskCreated(taskId)], { now: NOW });
    });
    const read = await stub.read(NOW);
    expect(Object.keys(read.state.tasks.byId)).toContain(taskId);
    expect(read.seq).toBe(1);
  });
});

describe("derive", () => {
  it("creates the current week's instance for a recurring preset pushed by a client", async () => {
    const stub = freshStore();
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append(
        [
          envelope("preset.created", {
            definition: {
              recurrence: {
                due: { time: "23:59", weekday: 7 },
                issued: { time: "00:00", weekday: 1 },
                tz: "UTC",
              },
            },
            extends: "hw",
            id: "hw.test",
            name: "Test HW",
          }),
        ],
        { now: NOW },
      );
      const { events } = await instance.list(0, 100);
      const instanceEvent = events.find((event) => event.id.startsWith("hw:hw.test:"));
      expect(instanceEvent).toMatchObject({
        deviceId: "server",
        recordedAt: NOW,
        source: "system",
        type: "task.created",
      });
      const [task] = await instance.db.select().from(schema.tasks);
      expect(task?.presetId).toBe("hw.test");
    });
  });

  it("closes an overdue hard-deadline task as missed and an empty instance as skipped", async () => {
    const stub = freshStore();
    const taskId = newId();
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append(
        [
          envelope(
            "task.created",
            {
              dueAt: "2026-10-01T00:00:00.000Z",
              dueTz: "UTC",
              presetId: "personal",
              taskId,
              title: "Late",
            },
            { occurredAt: "2026-09-20T00:00:00.000Z" },
          ),
          envelope(
            "task.created",
            {
              dueAt: "2026-10-01T00:00:00.000Z",
              dueTz: "UTC",
              presetId: "hw",
              taskId: "hw:hw:2026-W39",
              title: "HW 1",
            },
            { id: "hw:hw:2026-W39", occurredAt: "2026-09-20T00:00:00.000Z", source: "system" },
          ),
        ],
        { now: NOW },
      );
      const { events } = await instance.list(0, 100);
      expect(events.find((event) => event.id === `auto:${taskId}:missed`)).toMatchObject({
        occurredAt: "2026-10-01T00:00:00.000Z",
        payload: { outcome: "cancelled_missed", taskId },
        source: "system",
      });
      expect(events.find((event) => event.id === "auto:hw:hw:2026-W39:skipped")).toMatchObject({
        payload: { outcome: "skipped", reason: "not-assigned" },
      });
      const rows = await instance.db.select().from(schema.tasks);
      expect(rows.map((row) => [row.id, row.outcome, row.closedAt]).toSorted()).toEqual(
        [
          [taskId, "cancelled_missed", "2026-10-01T00:00:00.000Z"],
          ["hw:hw:2026-W39", "skipped", "2026-10-02T00:00:00.000Z"],
        ].toSorted(),
      );
    });
  });

  it("emits a system event only once, whatever the number of reads", async () => {
    const stub = freshStore();
    const taskId = newId();
    await runInDurableObject(stub, async (instance: UserStore) => {
      await instance.append(
        [
          envelope(
            "task.created",
            {
              dueAt: "2026-10-01T00:00:00.000Z",
              dueTz: "UTC",
              presetId: "personal",
              taskId,
              title: "Late",
            },
            { occurredAt: "2026-09-20T00:00:00.000Z" },
          ),
        ],
        { now: NOW },
      );
    });
    const first = await stub.read(NOW);
    const second = await stub.read("2026-10-08T12:00:00.000Z");
    expect(second.seq).toBe(first.seq);
    expect(first.seq).toBe(2);
  });
});

describe("apply", () => {
  const meta = { deviceId: "mcp", now: NOW, source: "mcp" as const };

  const created = (taskId: string): EventInput => ({
    occurredAt: NOW,
    payload: { fields: {}, presetId: "personal", subtasks: [], taskId, title: "From MCP" },
    precision: "exact",
    source: "mcp",
    type: "task.created",
  });

  it("stamps ids, recordedAt and device, writes, and returns the stored events and state", async () => {
    const stub = freshStore();
    const taskId = newId();
    const result = await stub.apply([created(taskId)], meta);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.events).toHaveLength(1);
    expect(result.value.events[0]).toMatchObject({
      deviceId: "mcp",
      occurredAt: NOW,
      recordedAt: NOW,
      source: "mcp",
      type: "task.created",
    });
    expect(result.value.state.tasks.byId[taskId]?.title).toBe("From MCP");
    expect(result.value.seq).toBe(1);
  });

  it("validates against the state as the batch unfolds and stops at the first error", async () => {
    const stub = freshStore();
    const taskId = newId();
    const result = await stub.apply(
      [
        created(taskId),
        {
          occurredAt: NOW,
          payload: { subtaskId: "nope", taskId },
          precision: "exact",
          source: "mcp",
          type: "task.subtask.solved",
        },
      ],
      meta,
    );
    expect(result).toEqual({ error: { code: "subtask/unknown", index: 1 }, ok: false });
    expect((await stub.read(NOW)).seq).toBe(0);
  });

  it("refuses a revoke of an event that is not in the log", async () => {
    const stub = freshStore();
    const result = await stub.apply(
      [
        {
          occurredAt: NOW,
          payload: { targetId: newId() },
          precision: "exact",
          source: "mcp",
          type: "event.revoked",
        },
      ],
      meta,
    );
    expect(result).toEqual({ error: { code: "event/not-found", index: 0 }, ok: false });
  });

  it("dryRun returns the would-be events and the resulting state without writing", async () => {
    const stub = freshStore();
    const taskId = newId();
    const preview = await stub.dryRun([created(taskId)], meta);
    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    expect(preview.value.events[0]?.type).toBe("task.created");
    expect(preview.value.state.tasks.byId[taskId]?.title).toBe("From MCP");
    expect((await stub.read(NOW)).seq).toBe(0);
  });
});
