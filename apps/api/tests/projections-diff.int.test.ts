import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addMinutesIso, newId } from "@pace/core";

import * as schema from "../src/user-store/schema.ts";
import { UserStore } from "../src/user-store/user-store.ts";
import { meterSql } from "./helpers.ts";

/**
The store's clock, frozen far ahead of the real one (bug-lessons classes 9 and 54): a projection
column read against `now` reads the same instant in the store's rows and in the rows a full rewrite
gives.
*/
const NOW = "2099-10-07T12:00:00.000Z";
const DAY_START = "2099-10-07T00:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

/** A deployed build: the mark it writes proves the rows mirrored the state before a write. */
const deployed = { ...env, PACE_VERSION: "v-test" };

const freshStore = () => env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));

type Raw = Record<string, unknown>;

const envelope = (type: string, payload: Raw, occurredAt = NOW): Raw => ({
  deviceId: "dev-1",
  id: newId(),
  occurredAt,
  payload,
  precision: "exact",
  recordedAt: NOW,
  source: "app",
  type,
});

const taskCreated = (taskId: string, occurredAt = DAY_START): Raw =>
  envelope(
    "task.created",
    {
      presetId: "hw",
      subtasks: [
        { id: "s1", label: "1", number: 1 },
        { id: "s2", label: "2", number: 2 },
      ],
      taskId,
      title: `Sheet ${taskId}`,
    },
    occurredAt,
  );

const byText = (a: string, b: string): number => a.localeCompare(b);

/** Every projection row, in one order. */
const rowsOf = async (state: DurableObjectState) => {
  const store = new UserStore(state, deployed);
  return {
    presets: (await store.db.select().from(schema.presets)).toSorted((a, b) => byText(a.id, b.id)),
    projects: (await store.db.select().from(schema.projects)).toSorted((a, b) =>
      byText(a.id, b.id),
    ),
    subtasks: (await store.db.select().from(schema.subtasks)).toSorted((a, b) =>
      byText(a.taskId + a.id, b.taskId + b.id),
    ),
    tasks: (await store.db.select().from(schema.tasks)).toSorted((a, b) => byText(a.id, b.id)),
  };
};

/**
The rows every row written from scratch gives (another build's first cold start), after which the
deployed build's own cold start writes them and its mark again: the store's next write still finds
the rows marked as mirroring its state, and takes the diff.
*/
const fullRewriteOf = async (state: DurableObjectState) => {
  await new UserStore(state, { ...env, PACE_VERSION: "v-check" }).querySql("SELECT 1");
  const rows = await rowsOf(state);
  await new UserStore(state, deployed).querySql("SELECT 1");
  return rows;
};

describe("the out-of-order diff of the projection rows", () => {
  it("deletes a revoked task's rows, and only those (a History undo)", async () => {
    const kept = newId();
    const undone = newId();
    await runInDurableObject(freshStore(), async (_instance, state) => {
      const store = new UserStore(state, deployed);
      const created = taskCreated(undone);
      await store.append([taskCreated(kept), created], { now: NOW });
      const { cost } = meterSql(state.storage);
      await store.append([envelope("event.revoked", { targetId: created["id"] })], { now: NOW });
      // Its task row and its two problems deleted, nothing written again.
      expect(cost().projectionRows).toBe(3);
      const rows = await rowsOf(state);
      expect(rows.tasks.map((task) => task.id)).toEqual([kept]);
      expect(new Set(rows.subtasks.map((row) => row.taskId))).toEqual(new Set([kept]));
      expect(await fullRewriteOf(state)).toEqual(rows);
    });
  });
});

const TASKS = ["t-a", "t-b", "t-c"] as const;
const IMPORTANCE = ["asap", "normal", "nice_to_have"] as const;
const OUTCOMES = ["done", "cancelled", "cancelled_missed", "skipped"] as const;

type Step = {
  readonly kind: "close" | "create" | "importance" | "rename" | "revoke" | "solve";
  readonly task: number;
  readonly pick: number;
  /**
  Minutes before the batch's own now (each batch an hour after the one before): some after all
  that is in the log (the in-order path), some before it (out of order: rebuilt and diffed).
  */
  readonly back: number;
};

const step: fc.Arbitrary<Step> = fc.record({
  back: fc.integer({ max: 120, min: 0 }),
  kind: fc.constantFrom("close", "create", "importance", "rename", "revoke", "solve"),
  pick: fc.nat(),
  task: fc.integer({ max: TASKS.length - 1, min: 0 }),
});

/** The event a step writes at `now`; a revoke targets one of the events written before it. */
const eventOf = (
  { back, kind, pick, task }: Step,
  { now, written }: { readonly now: string; readonly written: readonly Raw[] },
): Raw => {
  const taskId = TASKS[task] ?? "t-a";
  const at = addMinutesIso(now, -back);
  const builders: Readonly<Record<Step["kind"], () => Raw>> = {
    close: () => envelope("task.closed", { outcome: OUTCOMES[pick % OUTCOMES.length], taskId }, at),
    create: () => taskCreated(taskId, at),
    importance: () =>
      envelope(
        "task.importance.set",
        { importance: IMPORTANCE[pick % IMPORTANCE.length], taskId },
        at,
      ),
    rename: () => envelope("task.updated", { taskId, title: `Renamed ${String(pick)}` }, at),
    revoke: () =>
      envelope("event.revoked", { targetId: written[pick % written.length]?.["id"] ?? "none" }, at),
    solve: () =>
      envelope("task.subtask.solved", { subtaskId: pick % 2 === 0 ? "s1" : "s2", taskId }, at),
  };
  return { ...builders[kind](), recordedAt: now };
};

/** Up to six writes of one to three events each. */
const batchesOf = fc.array(fc.array(step, { maxLength: 3, minLength: 1 }), {
  maxLength: 6,
  minLength: 1,
});

/**
Writes each batch an hour after the one before through the store's own path, and after each one
compares the rows with every row written from scratch; answers whether they all were the same.
*/
const didWritesMirrorTheLog = async (batches: readonly (readonly Step[])[]): Promise<boolean> =>
  await runInDurableObject(freshStore(), async (_instance, state) => {
    const store = new UserStore(state, deployed);
    const written: Raw[] = [];
    for (const [index, batch] of batches.entries()) {
      const now = addMinutesIso(NOW, 60 * (index + 1));
      vi.setSystemTime(new Date(now));
      const events = batch.map((each) => {
        const event = eventOf(each, { now, written });
        written.push(event);
        return event;
      });
      await store.append(events, { now });
      const rows = JSON.stringify(await rowsOf(state));
      if (JSON.stringify(await fullRewriteOf(state)) !== rows) {
        return false;
      }
    }
    return true;
  });

describe("the projection rows after any writes", () => {
  it("equal every row written from scratch, in order or not, corrections included (property)", async () => {
    await fc.assert(fc.asyncProperty(batchesOf, didWritesMirrorTheLog), { numRuns: 30 });
    // A rename in order, then a close in order and one again: the incremental path's own rows.
    const inOrder: readonly (readonly Step[])[] = [
      [{ back: 0, kind: "create", pick: 0, task: 1 }],
      [
        { back: 0, kind: "rename", pick: 0, task: 1 },
        { back: 0, kind: "close", pick: 0, task: 1 },
      ],
    ];
    expect(await didWritesMirrorTheLog(inOrder)).toBe(true);
  }, 60_000);
});
