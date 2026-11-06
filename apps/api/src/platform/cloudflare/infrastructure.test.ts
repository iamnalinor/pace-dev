import { runDurableObjectAlarm } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { type EventInput, newId } from "@pace/core";

import { runInUserStore as runInDurableObject } from "../../../tests/host.ts";
import { users } from "../../shared/db/d1-schema.ts";
import { armEarliest } from "../../user-store/alarm.ts";
import { actorStorage, migrateActor } from "./actor-storage.ts";
import { cloudflareBindings } from "./bindings.ts";
import { keyValue } from "./key-value.ts";
import { UserStore as HostedStore } from "./user-store.ts";

/** Own callable methods, excluding constructor and accessors. */
const ownMethods = (prototype: object): readonly string[] =>
  Object.getOwnPropertyNames(prototype).filter((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    return name !== "constructor" && typeof descriptor?.value === "function";
  });

const taskInput = (title: string, now: string): EventInput => ({
  type: "task.created",
  occurredAt: now,
  precision: "exact",
  source: "web",
  payload: { taskId: newId(), title, presetId: "personal", fields: {}, subtasks: [] },
});

describe("Cloudflare infrastructure ports", () => {
  it("copies string settings but keeps unknown raw bindings inside the adapter", () => {
    const raw = {
      ...env,
      LLM_BASE_URL_9: "https://llm.test/v1",
      UNKNOWN_OBJECT: { secret: "hidden" },
      CF_VERSION_METADATA: {
        id: "host-version",
        tag: "host-tag",
        timestamp: "2026-11-06T00:00:00.000Z",
      },
    };
    const bindings = cloudflareBindings(raw);
    expect(Reflect.has(bindings, "MIGRATION_DB")).toBe(false);
    expect(Reflect.has(bindings, "TEST_MIGRATIONS")).toBe(false);
    expect(Reflect.has(bindings, "UNKNOWN_OBJECT")).toBe(false);
    expect(Reflect.get(bindings, "LLM_BASE_URL_9")).toBe("https://llm.test/v1");
    expect(bindings.CF_VERSION_METADATA).toEqual({ id: "host-version" });
  });

  it("hosts exactly the service's public method surface", async () => {
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(store, async (service) => {
      let prototype: null | object = Object.getPrototypeOf(service) as object;
      const methods: string[] = [];
      while (prototype !== null && prototype !== Object.prototype) {
        methods.push(...ownMethods(prototype));
        prototype = Object.getPrototypeOf(prototype) as null | object;
      }
      const publicMethods = [...new Set(methods)].filter((name) => name !== "sleepPass");
      const actual = ownMethods(HostedStore.prototype).toSorted((a, b) => a.localeCompare(b));
      expect(actual).toEqual(publicMethods.toSorted((a, b) => a.localeCompare(b)));
    });
  });

  it("holds a user's next RPC through an external await while another user progresses", async () => {
    const one = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    const other = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(one, async (service) => {
      const remember = service.remember.bind(service);
      Object.defineProperty(service, "remember", {
        value: async (key: string, value: string) => {
          if (key === "held") {
            await service.ctx.storage.put("port:entered", true);
            while ((await service.ctx.storage.get("port:release")) !== true) {
              await new Promise((resolve) => {
                setTimeout(resolve, 5);
              });
            }
          }
          await remember(key, value);
        },
      });
    });
    const held = one.remember("held", "first");
    await vi.waitFor(async () => {
      const entered = await runInDurableObject(
        one,
        async (service) => await service.ctx.storage.get("port:entered"),
      );
      expect(entered).toBe(true);
    });
    let isNextDone = false;
    const finishNext = async () => {
      await one.remember("next", "second");
      isNextDone = true;
    };
    const next = finishNext();
    try {
      await other.remember("other", "independent");
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(isNextDone).toBe(false);
    } finally {
      await runInDurableObject(one, async (service) => {
        await service.ctx.storage.put("port:release", true);
      });
      await Promise.all([held, next]);
    }
    expect(await one.peek("next")).toBe("second");
  });

  it("releases the hosted queue when a service operation rejects", async () => {
    const one = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(one, async (_service, state) => {
      const host = new HostedStore(state, env);
      const remember = host.service.remember.bind(host.service);
      Object.defineProperty(host.service, "remember", {
        value: async (key: string, value: string) => {
          if (key === "fail") {
            throw new Error("fixture failure");
          }
          await remember(key, value);
        },
      });
      await expect(host.remember("fail", "failed")).rejects.toThrow("fixture failure");
      await host.remember("recovered", "kept");
      expect(await host.peek("recovered")).toBe("kept");
    });
  });

  it("rolls back every statement of a shared SQLite batch when a later statement fails", async () => {
    const db = cloudflareBindings(env).DB;
    const id = crypto.randomUUID();
    const telegramId = crypto.randomUUID();
    const values = { id, telegramId, name: "Port test", createdAt: new Date() };
    const conflictingId = crypto.randomUUID();
    await expect(
      db.batch([
        db.insert(users).values(values),
        db.insert(users).values({ ...values, id: conflictingId }),
      ]),
    ).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(0);
  });

  it("does not apply committed actor migrations twice or erase existing data", async () => {
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await store.remember("migration:value", "kept");
    const now = new Date().toISOString();
    const written = await store.apply([taskInput("Migration evidence", now)], {
      now,
      deviceId: "port",
      source: "web",
    });
    expect(written.ok).toBe(true);
    await runInDurableObject(store, async (_instance, state) => {
      const count = () =>
        [
          ...state.storage.sql.exec<{ count: number }>(
            "SELECT count(*) AS count FROM __drizzle_migrations",
          ),
        ][0]?.count;
      const before = count();
      expect(before).toBeGreaterThan(0);
      await migrateActor(state.storage);
      await migrateActor(state.storage);
      expect(count()).toBe(before);
    });
    expect(await store.peek("migration:value")).toBe("kept");
    expect(await store.countEvents()).toBe(1);
  });

  it("delivers a scheduled wake-up once and leaves no second due alarm", async () => {
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(store, async (service, state) => {
      Object.defineProperty(service, "alarm", {
        value: async () => {
          const fired = (await state.storage.get<number>("port:fired")) ?? 0;
          await state.storage.put("port:fired", fired + 1);
        },
      });
      await actorStorage(state.storage).setAlarm(Date.now() + 3_600_000);
    });
    expect(await runDurableObjectAlarm(store)).toBe(true);
    expect(await runDurableObjectAlarm(store)).toBe(false);
    await runInDurableObject(store, async (_service, state) => {
      expect(await state.storage.get("port:fired")).toBe(1);
    });
  });

  it("actually delivers a past wake-up exactly once", async () => {
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(store, async (service, state) => {
      Object.defineProperty(service, "alarm", {
        value: async () => {
          const fired = await service.peek("port:past-fired");
          await service.remember("port:past-fired", (typeof fired === "number" ? fired : 0) + 1);
        },
      });
      await actorStorage(state.storage).setAlarm(Date.now() - 1);
    });
    await vi.waitFor(async () => {
      expect(await store.peek("port:past-fired")).toBe(1);
    });
    expect(await runDurableObjectAlarm(store)).toBe(false);
    expect(await store.peek("port:past-fired")).toBe(1);
  });

  it("keeps concurrent RPC writes in one actor and separates another person's log", async () => {
    const host = cloudflareBindings(env).USER_STORE;
    const one = host.of(crypto.randomUUID());
    const other = host.of(crypto.randomUUID());
    const now = new Date().toISOString();
    const meta = { now, deviceId: "port", source: "web" as const };
    const result = await Promise.all([
      one.apply([taskInput("One", now)], meta),
      one.apply([taskInput("Two", now)], meta),
      other.apply([taskInput("Three", now)], meta),
    ]);
    expect(result.every((entry) => entry.ok)).toBe(true);
    const state = await one.read(now);
    expect(
      Object.values(state.state.tasks.byId)
        .map((task) => task.title)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["One", "Two"]);
    expect(
      Object.values((await other.read(now)).state.tasks.byId).map((task) => task.title),
    ).toEqual(["Three"]);
    expect((await one.list(0, 100)).events.map((event) => event.id)).toHaveLength(2);
  });

  it("keeps typed actor values and durable wake-ups across adapter recreation", async () => {
    const store = env.USER_STORE.get(env.USER_STORE.idFromName(crypto.randomUUID()));
    await runInDurableObject(store, async (_instance, state) => {
      const first = actorStorage(state.storage);
      await first.put("port:value", { count: 2 });
      const at = Date.now() + 3_600_000;
      await armEarliest(first, at);
      await armEarliest(first, at + 60_000);
      const restarted = actorStorage(state.storage);
      expect(await restarted.get("port:value")).toEqual({ count: 2 });
      expect(await restarted.getAlarm()).toBe(at);
      await armEarliest(restarted, at - 60_000);
      expect(await first.getAlarm()).toBe(at - 60_000);
    });
  });

  it("adapts JSON and paginated key/value operations without exposing the binding", async () => {
    const kv = keyValue(env.OAUTH_KV);
    const prefix = `port:${crypto.randomUUID()}:`;
    await kv.put(`${prefix}one`, JSON.stringify({ value: 1 }));
    await kv.put(`${prefix}two`, JSON.stringify({ value: 2 }));
    expect(await kv.get(`${prefix}one`, "json")).toEqual({ value: 1 });
    const first = await kv.list({ prefix, limit: 1 });
    expect(first.keys).toHaveLength(1);
    expect(first.list_complete).toBe(false);
    const second = await kv.list({
      prefix,
      ...(first.cursor !== undefined && { cursor: first.cursor }),
      limit: 1,
    });
    expect(second.keys).toHaveLength(1);
    expect(second.keys[0]?.name).not.toBe(first.keys[0]?.name);
    await kv.delete(`${prefix}one`);
    expect(await kv.get(`${prefix}one`)).toBeNull();
  });

  it("resolves the existing typed store for a person without changing actor identity", async () => {
    const host = cloudflareBindings(env).USER_STORE;
    const person = crypto.randomUUID();
    const first = host.of(person);
    const second = host.of(person);
    expect(await first.storeId()).toBe(await second.storeId());
    expect(await host.of(crypto.randomUUID()).storeId()).not.toBe(await first.storeId());
  });
});
