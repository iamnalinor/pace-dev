import {
  createExecutionContext,
  runDurableObjectAlarm,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  type Action,
  blankModelAction,
  coreReducer,
  endpoints,
  type EventInput,
  INITIAL_CORE_STATE,
  materialize,
  newId,
  parseEvent,
  type ParseResponse,
  type RequestDomain,
} from "@pace/core";

import { createApp } from "../src/app.ts";
import { fakeParseModel } from "../src/shared/llm/fake-model.ts";
import { json, loginAsDev, readJson } from "./helpers.ts";

/**
Every answer is read through the endpoint's own output schema, as the client reads it: the
server must never send what its contract refuses.
*/
const asAnswered = (answer: unknown): ParseResponse => endpoints.parse.run.output.parse(answer);

const parse = async (token: string, text: string, domain?: RequestDomain): Promise<ParseResponse> =>
  asAnswered(
    await json("/api/parse", { body: { text, ...(domain !== undefined && { domain }) }, token }),
  );

/** The only action of a parsed answer. */
const only = (answer: ParseResponse): Action => {
  expect(answer.status).toBe("parsed");
  expect(answer.actions).toHaveLength(1);
  const [action] = answer.actions;
  if (action === undefined) {
    throw new Error("no action");
  }
  return action;
};

const storeOf = async (token: string) => {
  const me = await json<{ id: string }>("/api/me", { token });
  return env.USER_STORE.get(env.USER_STORE.idFromName(me.id));
};

/** Read the public sync stream rather than a Durable Object's private projection. */
const stateFor = async (token: string) => {
  const answer = await json("/api/sync/pull", { token });
  const pulled = endpoints.sync.pull.output.parse(answer);
  const events = pulled.events.map((event) => {
    const parsed = parseEvent(event);
    if (!parsed.ok) {
      throw new Error(`Invalid event in sync stream: ${parsed.error}`);
    }
    return parsed.value;
  });
  return materialize(events, coreReducer, INITIAL_CORE_STATE);
};

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/** A task with two problems and a block logged an hour ago, written straight into the store. */
const seed = async (token: string, title: string, label: string) => {
  const taskId = newId();
  const activityId = newId();
  const now = new Date().toISOString();
  const inputs: EventInput[] = [
    {
      occurredAt: minutesAgo(5),
      payload: {
        fields: {},
        presetId: "personal",
        subtasks: [
          { id: `${taskId}:1`, label: "photo" },
          { id: `${taskId}:2`, label: "form" },
        ],
        taskId,
        title,
      },
      precision: "exact",
      source: "mcp",
      type: "task.created",
    },
    {
      occurredAt: minutesAgo(60),
      payload: {
        activityId,
        category: "other",
        endAt: minutesAgo(60),
        label,
        startAt: minutesAgo(120),
      },
      precision: "exact",
      source: "mcp",
      type: "activity.logged",
    },
  ];
  const stub = await storeOf(token);
  const applied = await stub.apply(inputs, { deviceId: "test", now, source: "mcp" });
  expect(applied.ok).toBe(true);
  return { activityId, taskId };
};

/** A Worker whose only model is rate limited for `seconds`. */
const limitedApp = (seconds: number) =>
  createApp({
    fetch: async () => {
      throw new Error("no network in tests");
    },
    parseProviders: () => [
      { model: fakeParseModel(() => ({ rateLimitedFor: seconds })), name: "fake" },
    ],
    telegramFetch: async () => {
      throw new Error("no network in tests");
    },
  });

const callLimited = async (
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const ctx = createExecutionContext();
  const response = await limitedApp(30).fetch(
    new Request(`https://pace-api.test${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
};

const parseLimited = async (token: string, body: object): Promise<ParseResponse> => {
  const init = { body: JSON.stringify(body), method: "POST" };
  return asAnswered(await readJson(await callLimited(token, "/api/parse", init)));
};

type Pulled = { events: { type: string; payload: Record<string, unknown> }[] };

/** The events with this title in their payload, as the store has them now. */
const titled = async (token: string, title: string) =>
  (await json<Pulled>("/api/sync/pull", { token })).events.filter(
    (event) => event.payload["title"] === title,
  );

/** Lifts the remembered rate limit and lets the store read what waits, a minute on. */
const drainLater = async (token: string): Promise<void> => {
  const stub = await storeOf(token);
  await stub.noteLlmLimits({ fake: "2000-01-01T00:00:00.000Z" }, new Date().toISOString());
  await stub.drainParses(new Date(Date.now() + 60_000).toISOString());
};

describe("POST /api/parse: tasks", () => {
  it("keeps the owner's full short title when the model shortens it", async () => {
    const token = await loginAsDev("1001");
    const app = createApp({
      fetch: async () => {
        throw new Error("no network in tests");
      },
      parseProviders: () => [
        {
          model: fakeParseModel(() => ({
            actions: [
              blankModelAction({ kind: "task.create", title: "челику", description: "Написать" }),
            ],
            confidence: 1,
            domain: "task",
            questions: [],
          })),
          name: "fake",
        },
      ],
      telegramFetch: async () => {
        throw new Error("no network in tests");
      },
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request("https://pace-api.test/api/parse", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Написать челику", domain: "task" }),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const answer = asAnswered(await readJson(response));
    expect(only(answer)).toMatchObject({
      task: { title: "Написать челику", description: null },
    });
  });

  it("still answers `proposals` for apps installed before the rename (bug class 13)", async () => {
    const token = await loginAsDev("1001");
    const parsed = await json<{ actions: unknown[]; proposals: unknown[] }>("/api/parse", {
      body: { text: "купить кабель USB-C" },
      token,
    });
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.proposals).toEqual(parsed.actions);
    const limited = await json<{ actions: unknown[]; proposals: unknown[] }>("/api/parse", {
      body: { text: "позвонить маме завтра" },
      token: await loginAsDev("1002"),
    });
    expect(limited.proposals).toEqual(limited.actions);
  });

  it("revises a create from the request: the correction is neither its description nor its source", async () => {
    const token = await loginAsDev("1001");
    const first = await parse(token, "Купить молоко");
    const revised = asAnswered(
      await json("/api/parse", {
        body: {
          text: "нет, на пятницу",
          thread: [{ actions: first.actions, text: "Купить молоко" }],
        },
        token,
      }),
    );
    expect(only(revised)).toMatchObject({
      kind: "task.create",
      task: { description: null, sourceText: "Купить молоко" },
    });
  });

  it("reads a message into a new task, sure of the field it came from, and writes nothing", async () => {
    const token = await loginAsDev("1001");
    const answer = await parse(token, "купить кабель USB-C");
    expect(answer).toMatchObject({ confidence: 1, domain: "task", provider: "fake" });
    expect(only(answer)).toMatchObject({
      kind: "task.create",
      summary: "The assistant will create “купить кабель USB-C”",
      task: {
        presetId: "personal",
        sourceText: "купить кабель USB-C",
        title: "купить кабель USB-C",
      },
    });
    const pulled = await json<{ events: unknown[] }>("/api/sync/pull", { token });
    expect(pulled.events).toEqual([]);
    const { decisions } = await json<{ decisions: { rule: string; outcome: string }[] }>(
      "/api/decisions?q=USB-C",
      { token },
    );
    expect(decisions[0]).toMatchObject({
      // What the log needs to say in words what became of the message, and who read it.
      inputs: {
        provider: "fake",
        steps: [{ kind: "task.create", subject: "купить кабель USB-C", taskId: null }],
        text: "купить кабель USB-C",
      },
      outcome: "parsed",
      rule: "parse.task.create",
    });
  });

  it("proposes edits, a close, a delete and subtasks of an existing task by its id", async () => {
    const token = await loginAsDev("1001");
    const { taskId } = await seed(token, "Renew the passport", "Visa office");
    expect(only(await parse(token, "delete task Renew the passport"))).toEqual({
      kind: "task.delete",
      summary: "The assistant will delete “Renew the passport”",
      taskId,
    });
    expect(only(await parse(token, "close task renew the passport"))).toMatchObject({
      kind: "task.close",
      outcome: "done",
      taskId,
    });
    expect(
      only(await parse(token, "rename task Renew the passport to Renew the ID")),
    ).toMatchObject({ kind: "task.update", patch: { title: "Renew the ID" }, taskId });
    expect(only(await parse(token, "add to Renew the passport: copy, fee"))).toMatchObject({
      kind: "task.addSubtasks",
      subtasks: [
        { label: "copy", number: null },
        { label: "fee", number: null },
      ],
      taskId,
    });
    expect(only(await parse(token, "solved in Renew the passport: form"))).toMatchObject({
      kind: "task.markSubtasks",
      subtaskIds: [`${taskId}:2`],
      taskId,
    });
    const { decisions } = await json<{ decisions: { rule: string }[] }>("/api/decisions?q=Renew", {
      token,
    });
    expect(decisions.map((decision) => decision.rule)).toContain("parse.task.delete");
  });

  it("proposes nothing for a task the model names but the lists do not hold", async () => {
    const token = await loginAsDev("1001");
    const answer = await parse(token, "delete task Something never created");
    expect(answer).toMatchObject({ domain: "task", actions: [], status: "parsed" });
  });
});

describe("POST /api/parse: activities", () => {
  it("reads what the person is doing, a block just gone, and edits and deletes of one", async () => {
    const token = await loginAsDev("1002");
    const { activityId } = await seed(token, "Call the bank", "Военкомат");
    expect(only(await parse(token, "Пошел в ЦСС, 20мин", "activity"))).toEqual({
      category: "other",
      expectMinutes: 20,
      kind: "activity.start",
      label: "Пошел в ЦСС",
      summary: "The assistant will start “Пошел в ЦСС”",
    });
    expect(only(await parse(token, "20 мин читал", "activity"))).toMatchObject({
      kind: "activity.log",
      label: "читал",
    });
    expect(
      only(await parse(token, "rename activity Военкомат to Военкомат днём", "activity")),
    ).toMatchObject({
      activityId,
      kind: "activity.update",
      patch: { label: "Военкомат днём" },
    });
    expect(only(await parse(token, "delete activity Военкомат", "activity"))).toMatchObject({
      activityId,
      kind: "activity.delete",
    });
  });

  it("asks how long an activity takes on `#ask` (the fake), and an answer sets it", async () => {
    const token = await loginAsDev("1002");
    const asked = await parse(token, "#ask Bar question", "activity");
    expect(only(asked)).toMatchObject({ kind: "activity.start", label: "Bar question" });
    expect(asked.questions).toEqual([
      { field: "expectMinutes", options: ["20m", "1h", "2h"], question: "How long will it take?" },
    ]);
    const answered = asAnswered(
      await json("/api/parse", {
        body: {
          domain: "activity",
          text: "«How long will it take?» — 1h",
          thread: [{ actions: asked.actions, text: "#ask Bar question" }],
        },
        token,
      }),
    );
    expect(only(answered)).toMatchObject({
      expectMinutes: 60,
      kind: "activity.start",
      label: "Bar question",
    });
    expect(answered.questions ?? []).toEqual([]);
  });

  it("keeps only actions of the field the text came from", async () => {
    const token = await loginAsDev("1002");
    await seed(token, "Water the plants", "Garden");
    const answer = await parse(token, "delete task Water the plants", "activity");
    expect(answer).toMatchObject({ domain: "activity", actions: [], status: "parsed" });
  });
});

describe("POST /api/parse: auto", () => {
  it("says what the text is about and how sure the assistant is", async () => {
    const token = await loginAsDev("1001");
    const span = await parse(token, "20 мин читал", "auto");
    expect(span).toMatchObject({ confidence: 0.95, domain: "activity" });
    expect(only(span).kind).toBe("activity.log");
    const plain = await parse(token, "купить хлеб", "auto");
    expect(plain).toMatchObject({ confidence: 0.6, domain: "task" });
    expect(only(plain).kind).toBe("task.create");
  });
});

describe("POST /api/parse: no model", () => {
  it("offers a schema-valid rule action without a configured endpoint", async () => {
    const token = await loginAsDev("1002");
    const app = createApp({
      fetch: async () => {
        throw new Error("no network in tests");
      },
      parseProviders: () => [],
      telegramFetch: async () => {
        throw new Error("no network in tests");
      },
    });
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request("https://pace-api.test/api/parse", {
        body: JSON.stringify({ defer: true, domain: "activity", text: "ем" }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const answer = asAnswered(await readJson(response));
    expect(answer).toMatchObject({
      actions: [{ category: "food", kind: "activity.start", label: "ем" }],
      retryAt: null,
      status: "unavailable",
    });
  });

  it("says when to try again and proposes what the rules read, for either field", async () => {
    const token = await loginAsDev("1002");
    const task = await parseLimited(token, { text: "позвонить маме завтра" });
    expect(task).toMatchObject({ confidence: 1, domain: "task", status: "unavailable" });
    expect(task.status === "unavailable" ? task.retryAt : null).toMatch(/T/u);
    expect(task.actions).toMatchObject([
      { kind: "task.create", task: { title: "позвонить маме" } },
    ]);
    const homework = await parseLimited(token, { text: "ДЗ по алгебре" });
    expect(homework.actions).toMatchObject([
      { kind: "task.create", task: { title: "ДЗ по алгебре", description: null } },
    ]);
    const activity = await parseLimited(token, { domain: "activity", text: "20 мин читал" });
    expect(activity.actions).toMatchObject([{ kind: "activity.log", label: "читал" }]);
    const russianMeal = await parseLimited(token, { domain: "activity", text: "ем" });
    expect(russianMeal.actions).toMatchObject([
      { category: "food", kind: "activity.start", label: "ем" },
    ]);
    const englishMeal = await parseLimited(token, { domain: "activity", text: "eating" });
    expect(englishMeal.actions).toMatchObject([
      { category: "food", kind: "activity.start", label: "eating" },
    ]);
    const auto = await parseLimited(token, {
      domain: "auto",
      text: "7:30 - 8:30 - ходил в военкомат.",
    });
    expect(auto).toMatchObject({ confidence: 0.5, domain: "activity" });
  });

  it("keeps a deferred text and writes its reading once the assistant is back", async () => {
    const token = await loginAsDev("1002");
    const queued = await parseLimited(token, { defer: true, text: "позвонить в банк" });
    expect(queued).toMatchObject({ actions: [], status: "queued" });
    // Queued is not written: nothing of it exists until the store reads it.
    expect(await titled(token, "позвонить в банк")).toEqual([]);
    // The limit is remembered: the status says the assistant is out until then.
    const status = await readJson<{ available: boolean; retryAt: null | string }>(
      await callLimited(token, "/api/llm/status"),
    );
    expect(status.available).toBe(false);
    expect(status.retryAt).toMatch(/T/u);

    // The alarm comes when the limit lifts: the store reads the text itself (the fake model).
    const stub = await storeOf(token);
    await stub.noteLlmLimits({ fake: "2000-01-01T00:00:00.000Z" }, new Date().toISOString());
    const later = Date.now() + 60_000;
    await stub.drainParses(new Date(later).toISOString());
    const pulled = await json<{
      events: { type: string; payload: { taskId?: string; title?: string } }[];
    }>("/api/sync/pull", { token });
    const created = pulled.events.find((event) => event.payload.title === "позвонить в банк");
    expect(created?.type).toBe("task.created");
    const { decisions } = await json<{ decisions: { rule: string; outcome: string }[] }>(
      "/api/decisions?q=позвонить",
      { token },
    );
    expect(decisions[0]).toMatchObject({
      inputs: { steps: [{ kind: "task.create", subject: "позвонить в банк" }] },
      outcome: "applied",
      rule: "parse.deferred",
      taskId: created?.payload.taskId,
    });
    // The alarm armed when it was queued finds nothing left: no second copy.
    await runDurableObjectAlarm(stub);
    const again = await json<{ events: { type: string; payload: { title?: string } }[] }>(
      "/api/sync/pull",
      { token },
    );
    expect(again.events.filter((event) => event.payload.title === "позвонить в банк")).toHaveLength(
      1,
    );
  });

  it("adds problems to a task read later, the message kept as the task's source", async () => {
    const token = await loginAsDev("1002");
    const { taskId } = await seed(token, "Geometry sheet", "Gym");
    const text = "add to Geometry sheet: 7, 8";
    expect(await parseLimited(token, { defer: true, text })).toMatchObject({ status: "queued" });
    await drainLater(token);
    const state = await stateFor(token);
    expect(state.tasks.byId[taskId]?.subtasks.map((subtask) => subtask.label)).toEqual([
      "photo",
      "form",
      "7",
      "8",
    ]);
    expect(state.tasks.byId[taskId]?.sources.map((source) => source.text)).toContain(text);
  });

  it("puts a deferred delete in the Inbox instead of deleting unseen", async () => {
    const token = await loginAsDev("1001");
    const { taskId } = await seed(token, "Fix the bike", "Repair");
    const text = "delete task Fix the bike";
    expect(await parseLimited(token, { defer: true, text })).toMatchObject({ status: "queued" });
    const stub = await storeOf(token);
    await stub.noteLlmLimits({ fake: "2000-01-01T00:00:00.000Z" }, new Date().toISOString());
    await stub.drainParses(new Date(Date.now() + 60_000).toISOString());
    const state = await stateFor(token);
    expect(state.tasks.byId[taskId]).toBeDefined();
    const inbox = Object.values(state.tasks.byId).find((task) => task.title === text);
    expect(inbox?.presetId).toBe("inbox");
  });

  it("refuses an empty message, an unknown field and a missing session", async () => {
    const token = await loginAsDev("1001");
    expect((await json<{ code: string }>("/api/parse", { body: { text: " " }, token })).code).toBe(
      "validation",
    );
    expect(
      (await json<{ code: string }>("/api/parse", { body: { domain: "notes", text: "x" }, token }))
        .code,
    ).toBe("validation");
    expect(
      (await json<{ code: string }>("/api/parse", { body: { text: "x" } })).code,
    ).toBeDefined();
  });
});
