import { describe, expect, it } from "vitest";

import { endpoints, ParseResponseSchema } from "@pace/core";

import { createMemoryEventStore } from "./adapters/memory-event-store.ts";
import { createPaceClient, type PaceClient } from "./create-client.ts";
import {
  createFakeFetch,
  emptySyncRoutes,
  fakeMe,
  type FakeRoute,
  fakeUser,
  problem,
} from "./fake-fetch.fake.ts";
import { createMemorySessionStore } from "./session.ts";

const setup = async (
  routes: Readonly<Record<string, FakeRoute>> = {},
  storedToken?: string,
): Promise<{ readonly api: ReturnType<typeof createFakeFetch>; readonly client: PaceClient }> => {
  const session = createMemorySessionStore();
  if (storedToken !== undefined) {
    await session.set(storedToken);
  }
  const api = createFakeFetch({ ...emptySyncRoutes, "GET /api/me": () => fakeMe, ...routes });
  const client = createPaceClient({
    baseUrl: "https://api.test",
    deviceId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    fetch: api.fetch,
    now: () => "2026-10-06T12:00:00.000Z",
    session,
    source: "web",
    store: createMemoryEventStore(),
  });
  await client.auth.ready;
  await client.state.ready;
  return { api, client };
};

describe("createPaceClient", () => {
  it("wires the state and the sync client on one store", async () => {
    const { api, client } = await setup({
      "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    });
    expect(client.auth.store.getState().status).toBe("signed-out");
    expect(api.pathsCalled("/api")).toEqual([]);

    await client.auth.loginWithDev("1");
    await client.state.dispatch({
      occurredAt: "2026-10-06T10:00:00.000Z",
      payload: { language: "ru" },
      type: "settings.updated",
    });
    await expect(client.sync.syncNow()).resolves.toEqual({
      ok: true,
      value: { pulled: 0, pushed: 1 },
    });
    expect(api.pathsCalled("/api/sync")).toEqual([
      "/api/sync/pull",
      "/api/sync/push",
      "/api/sync/pull",
    ]);
    expect(client.state.store.getState().settings.language).toBe("ru");
  });

  it("exposes the actions and the clock, both on the same store", async () => {
    const { client } = await setup();
    expect(client.clock.now()).toBe("2026-10-06T12:00:00.000Z");
    const captured = await client.actions.captureInbox("buy milk");
    expect(captured.ok).toBe(true);
    expect(
      Object.values(client.state.store.getState().tasks.byId).map((task) => task.title),
    ).toEqual(["buy milk"]);
  });

  it("gives the API client the auth token", async () => {
    const { api, client } = await setup({
      "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }),
    });
    await client.auth.loginWithDev("1");
    await client.api.call(endpoints.me, {});
    expect(api.calls.at(-1)?.headers["authorization"]).toBe("Bearer tok_dev");
  });

  it("refreshes the user once a stored token is loaded", async () => {
    const { api, client } = await setup({}, "tok_stored");
    await expect
      .poll(() => client.auth.store.getState())
      .toEqual({ status: "signed-in", user: fakeUser });
    expect(api.pathsCalled("/api/me")).toEqual(["/api/me"]);
  });

  it("does not call the server for a signed-out device", async () => {
    const { api } = await setup();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(api.calls).toEqual([]);
  });
});

/** The assistant's answer from the activity field. */
const activityAnswer = (actions: readonly object[]) => ({
  confidence: 1,
  domain: "activity",
  actions,
  provider: "fake",
  status: "parsed",
});

describe("client.assistant", () => {
  const task = {
    description: null,
    dueAt: null,
    dueTz: null,
    estimateMinutes: 90,
    importance: null,
    link: null,
    presetId: "personal",
    projectId: null,
    projectName: null,
    sourceText: "разобрать почту, полтора часа",
    subtasks: [],
    title: "разобрать почту",
  };
  const parsed = {
    confidence: 1,
    domain: "task",
    actions: [{ kind: "task.create", summary: "New task: разобрать почту", task }],
    provider: "fake",
    status: "parsed",
  };

  it("turns the parse into composer edits", async () => {
    const { client } = await setup({ "POST /api/parse": () => parsed });
    const outcome = await client.assistant.read("разобрать почту, полтора часа");
    expect(outcome).toMatchObject({
      reading: { edits: { estimateMinutes: 90, title: "разобрать почту" }, provider: "fake" },
      status: "read",
    });
  });

  it("reads an answer from a newer server with keys it does not know yet", async () => {
    const newer = {
      ...parsed,
      extra: "top",
      actions: [{ ...parsed.actions[0], extra: "action", task: { ...task, extra: "draft" } }],
    };
    const { client } = await setup({ "POST /api/parse": () => newer });
    expect(await client.assistant.read("разобрать почту, полтора часа")).toMatchObject({
      reading: { edits: { title: "разобрать почту" } },
      status: "read",
    });
  });

  it("passes on when the assistant is out of requests, and a failure as failed", async () => {
    const retryAt = "2026-10-06T12:05:00.000Z";
    const { client } = await setup({
      "POST /api/parse": () => ({
        confidence: 1,
        domain: "task",
        actions: [],
        retryAt,
        status: "unavailable",
      }),
    });
    expect(await client.assistant.read("что-то")).toEqual({ retryAt, status: "unavailable" });
    const broken = await setup({ "POST /api/parse": () => problem(500, "internal") });
    expect(await broken.client.assistant.read("что-то")).toEqual({ status: "failed" });
  });

  it("offers a labelled rule action when the parse request itself fails", async () => {
    const { client } = await setup({ "POST /api/parse": () => problem(503, "unavailable") });
    const answer = await client.assistant.propose("ем", "activity");
    expect(ParseResponseSchema.safeParse(answer).success).toBe(true);
    expect(answer).toMatchObject({
      actions: [{ category: "food", kind: "activity.start", label: "ем" }],
      status: "unavailable",
    });
  });

  it("reads an activity note from the activity field, and nothing from another action", async () => {
    const bodies: unknown[] = [];
    const start = {
      category: "commute",
      expectMinutes: 20,
      kind: "activity.start",
      label: "ЦСС",
      summary: "Start: ЦСС",
    };
    const { client } = await setup({
      "POST /api/parse": (request) => {
        bodies.push(request.body);
        return activityAnswer([start]);
      },
    });
    expect(await client.assistant.readActivity("Пошел в ЦСС, 20мин")).toEqual({
      category: "commute",
      expectMinutes: 20,
      label: "ЦСС",
    });
    expect(bodies).toEqual([{ domain: "activity", text: "Пошел в ЦСС, 20мин" }]);
    const logged = await setup({
      "POST /api/parse": () =>
        activityAnswer([
          {
            category: "other",
            end: "2026-10-06T08:30:00.000Z",
            kind: "activity.log",
            label: "x",
            start: "2026-10-06T07:30:00.000Z",
            summary: "Log",
          },
        ]),
    });
    expect(await logged.client.assistant.readActivity("7:30-8:30 x")).toBeNull();
  });
});
