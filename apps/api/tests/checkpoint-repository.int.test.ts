import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { type Checkpoint, createCheckpoint, type Event } from "@pace/core";

import { actorStorage } from "../src/platform/cloudflare/actor-storage.ts";
import { CheckpointRepository } from "../src/user-store/checkpoint-repository.ts";
import { runInUserStore } from "./host.ts";

const BUILD = "checkpoint-test-v1";
const OLD = "2025-01-01T00:00:00.000Z";
const expected = (storeId: string) => ({ build: BUILD, storeId });
const snapshot = (storeId: string, count = 1): Checkpoint => {
  const records = Array.from({ length: count }, (_, i) => {
    const event: Event = {
      deviceId: "fixture",
      id: `auto:checkpoint:${String(i)}`,
      occurredAt: OLD,
      payload: {
        taskId: `task-${String(i)}`,
        title: `Задача 🦊 ${"a".repeat(200)} ${String(i)}`,
        presetId: "personal",
        fields: {},
        subtasks: [],
      },
      precision: "exact",
      recordedAt: OLD,
      source: "app",
      type: "task.created",
    };
    return { event, seq: i + 1 };
  });
  const result = createCheckpoint({
    ...expected(storeId),
    records,
    coveredSeq: count,
    cutoff: "2026-01-01T00:00:00.000Z",
    cutoffTimezone: "UTC",
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
const withStore = async (operation: Parameters<typeof runInUserStore>[1]) => {
  const id = env.USER_STORE.idFromName(crypto.randomUUID());
  return await runInUserStore(env.USER_STORE.get(id), operation);
};

const seed = (
  storage: Parameters<Parameters<typeof runInUserStore>[1]>[1]["storage"],
  count: number,
) => {
  for (let i = 0; i < count; i += 1) {
    storage.sql.exec(
      "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES (?, 'settings.updated', ?, ?, 'fixture', 'exact', 'app', '{}')",
      `auto:source:${String(i)}`,
      OLD,
      OLD,
    );
  }
};

describe("durable checkpoint repository", () => {
  it("roundtrips a Unicode snapshot larger than one durable value through bounded BLOB chunks", async () => {
    await withStore(async (store, state) => {
      const checkpoint = snapshot(await store.storeId(), 300);
      seed(state.storage, 300);
      const repository = new CheckpointRepository(store.ctx.storage);
      expect(await repository.publish(checkpoint, 300)).toBe(true);
      const cold = new CheckpointRepository(store.ctx.storage);
      expect(await cold.read(expected(checkpoint.storeId))).toEqual({ kind: "valid", checkpoint });
      const chunks = state.storage.sql
        .exec<{ bytes: number; kind: string }>(
          "SELECT length(data) AS bytes, typeof(data) AS kind FROM history_checkpoint_chunks",
        )
        .toArray();
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every((chunk) => chunk.kind === "blob" && chunk.bytes <= 65_536)).toBe(true);
    });
  });
  it.each([
    "DELETE FROM history_checkpoint_chunks WHERE chunk = 0",
    "UPDATE history_checkpoint_chunks SET chunk = chunk + 10",
    "UPDATE history_checkpoint_chunks SET data = zeroblob(length(data)) WHERE chunk = 0",
    "UPDATE history_checkpoint SET byte_count = byte_count + 1",
    "UPDATE history_checkpoint SET event_count = event_count + 1",
    "UPDATE history_checkpoint SET covered_seq = covered_seq + 1",
    "UPDATE history_checkpoint SET cutoff = '2020-01-01T00:00:00.000Z'",
    "UPDATE history_checkpoint SET format = 999",
    "UPDATE history_checkpoint SET sha256 = 'invalid'",
  ])("rejects damaged persisted evidence: %s", async (damage) => {
    await withStore(async (store, state) => {
      const checkpoint = snapshot(await store.storeId(), 100);
      seed(state.storage, 100);
      const repository = new CheckpointRepository(store.ctx.storage);
      expect(await repository.publish(checkpoint, 100)).toBe(true);
      state.storage.sql.exec(damage);
      expect(await repository.read(expected(checkpoint.storeId))).toEqual({ kind: "invalid" });
      expect(await store.countEvents()).toBe(100);
    });
  });

  it("distinguishes absence and rejects another build or generation", async () => {
    await withStore(async (store, state) => {
      const checkpoint = snapshot(await store.storeId());
      const repository = new CheckpointRepository(store.ctx.storage);
      expect(await repository.read(expected(checkpoint.storeId))).toEqual({ kind: "absent" });
      seed(state.storage, 1);
      expect(await repository.publish(checkpoint, 1)).toBe(true);
      expect(await repository.read({ build: "other", storeId: checkpoint.storeId })).toEqual({
        kind: "invalid",
      });
      expect(await repository.read(expected("another-generation"))).toEqual({ kind: "invalid" });
    });
  });

  it("retains the previous complete snapshot when a later chunk write fails", async () => {
    await withStore(async (store, state) => {
      const old = snapshot(await store.storeId());
      seed(state.storage, 300);
      const repository = new CheckpointRepository(store.ctx.storage);
      expect(await repository.publish(old, 300)).toBe(true);
      const storage = actorStorage(state.storage);
      const failing = new CheckpointRepository({
        ...storage,
        sql: {
          exec: (query, ...bindings) => {
            if (query.startsWith("INSERT INTO history_checkpoint_chunks") && bindings[0] === 1) {
              throw new Error("fixture chunk failure");
            }
            return storage.sql.exec(query, ...bindings);
          },
        },
      });
      await expect(failing.publish(snapshot(old.storeId, 300), 300)).rejects.toThrow(
        "fixture chunk failure",
      );
      expect(await repository.read(expected(old.storeId))).toEqual({
        kind: "valid",
        checkpoint: old,
      });
    });
  });

  it("refuses publication from a stale source cursor or after a generation change", async () => {
    await withStore(async (store, state) => {
      const checkpoint = snapshot(await store.storeId());
      seed(state.storage, 1);
      const repository = new CheckpointRepository(store.ctx.storage);
      expect(await repository.publish(checkpoint, 0)).toBe(false);
      state.storage.sql.exec(
        "INSERT INTO events (id,type,occurred_at,recorded_at,device_id,precision,source,payload) VALUES ('auto:new-source', 'settings.updated', ?, ?, 'fixture', 'exact', 'app', '{}')",
        OLD,
        OLD,
      );
      expect(await repository.publish(checkpoint, 1)).toBe(false);
      await state.storage.put("storeId", "changed-generation");
      expect(await repository.publish(checkpoint, 1)).toBe(false);
      expect(await repository.read(expected(checkpoint.storeId))).toEqual({ kind: "absent" });
    });
  });

  it("rejects a correctly hashed snapshot whose serialized state schema is unknown", async () => {
    await withStore(async (store, state) => {
      const checkpoint = snapshot(await store.storeId());
      seed(state.storage, 1);
      const repository = new CheckpointRepository(store.ctx.storage);
      expect(await repository.publish(checkpoint, 1)).toBe(true);
      const malformed = { ...checkpoint, state: { ...checkpoint.state, unknownSlice: {} } };
      const bytes = new TextEncoder().encode(JSON.stringify(malformed));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      state.storage.sql.exec(
        "UPDATE history_checkpoint_chunks SET data = ? WHERE chunk = 0",
        bytes.buffer,
      );
      state.storage.sql.exec(
        "UPDATE history_checkpoint SET byte_count = ?, sha256 = ?",
        bytes.byteLength,
        hash,
      );
      expect(await repository.read(expected(checkpoint.storeId))).toEqual({ kind: "invalid" });
    });
  });
});
