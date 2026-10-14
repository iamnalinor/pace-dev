import {
  createExecutionContext,
  runDurableObjectAlarm,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { type EventInput, newId, type ParseResponse, type Proposal } from "@pace/core";

import { createApp } from "../src/app.ts";
import { fakeParseModel } from "../src/shared/llm/fake-model.ts";
import { json, loginAsDev, readJson } from "./helpers.ts";

type Domain = "activity" | "auto" | "task";

const parse = async (token: string, text: string, domain?: Domain): Promise<ParseResponse> =>
  await json<ParseResponse>("/api/parse", {
    body: { text, ...(domain !== undefined && { domain }) },
    token,
  });

/** The only proposal of a parsed answer. */
const only = (answer: ParseResponse): Proposal => {
  expect(answer.status).toBe("parsed");
  expect(answer.proposals).toHaveLength(1);
  const [proposal] = answer.proposals;
  if (proposal === undefined) {
    throw new Error("no proposal");
  }
  return proposal;
};

const storeOf = async (token: string) => {
  const me = await json<{ id: string }>("/api/me", { token });
  return env.USER_STORE.get(env.USER_STORE.idFromName(me.id));
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

const parseLimited = async (token: string, body: object): Promise<ParseResponse> =>
  await readJson<ParseResponse>(
    await callLimited(token, "/api/parse", { body: JSON.stringify(body), method: "POST" }),
  );

describe("POST /api/parse: tasks", () => {
  it("reads a message into a new task, sure of the field it came from, and writes nothing", async () => {
    const token = await loginAsDev("1001");
    const answer = await parse(token, "купить кабель USB-C");
    expect(answer).toMatchObject({ confidence: 1, domain: "task", provider: "fake" });
    expect(only(answer)).toMatchObject({
      kind: "task.create",
      summary: "New task: купить кабель USB-C",
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
    expect(decisions[0]).toMatchObject({ outcome: "parsed", rule: "parse.task.create" });
  });

  it("proposes edits, a close, a delete and subtasks of an existing task by its id", async () => {
    const token = await loginAsDev("1001");
    const { taskId } = await seed(token, "Renew the passport", "Visa office");
    expect(only(await parse(token, "delete task Renew the passport"))).toEqual({
      kind: "task.delete",
      summary: "Delete “Renew the passport”",
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
    expect(answer).toMatchObject({ domain: "task", proposals: [], status: "parsed" });
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
      summary: "Start: Пошел в ЦСС",
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

  it("keeps only proposals of the field the text came from", async () => {
    const token = await loginAsDev("1002");
    await seed(token, "Water the plants", "Garden");
    const answer = await parse(token, "delete task Water the plants", "activity");
    expect(answer).toMatchObject({ domain: "activity", proposals: [], status: "parsed" });
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
  it("says when to try again and proposes what the rules read, for either field", async () => {
    const token = await loginAsDev("1002");
    const task = await parseLimited(token, { text: "позвонить маме завтра" });
    expect(task).toMatchObject({ confidence: 1, domain: "task", status: "unavailable" });
    expect(task.status === "unavailable" ? task.retryAt : null).toMatch(/T/u);
    expect(task.proposals).toMatchObject([
      { kind: "task.create", task: { title: "позвонить маме" } },
    ]);
    const activity = await parseLimited(token, { domain: "activity", text: "20 мин читал" });
    expect(activity.proposals).toMatchObject([{ kind: "activity.log", label: "читал" }]);
    const auto = await parseLimited(token, {
      domain: "auto",
      text: "7:30 - 8:30 - ходил в военкомат.",
    });
    expect(auto).toMatchObject({ confidence: 0.5, domain: "activity" });
  });

  it("keeps a deferred text and writes its reading once the assistant is back", async () => {
    const token = await loginAsDev("1002");
    const queued = await parseLimited(token, { defer: true, text: "позвонить в банк" });
    expect(queued).toMatchObject({ proposals: [], status: "queued" });
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
    const pulled = await json<{ events: { type: string; payload: { title?: string } }[] }>(
      "/api/sync/pull",
      { token },
    );
    const created = pulled.events.find((event) => event.payload.title === "позвонить в банк");
    expect(created?.type).toBe("task.created");
    const { decisions } = await json<{ decisions: { rule: string; outcome: string }[] }>(
      "/api/decisions?q=позвонить",
      { token },
    );
    expect(decisions[0]).toMatchObject({ outcome: "applied", rule: "parse.deferred" });
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

  it("puts a deferred delete in the Inbox instead of deleting unseen", async () => {
    const token = await loginAsDev("1001");
    const { taskId } = await seed(token, "Fix the bike", "Repair");
    const text = "delete task Fix the bike";
    expect(await parseLimited(token, { defer: true, text })).toMatchObject({ status: "queued" });
    const stub = await storeOf(token);
    await stub.noteLlmLimits({ fake: "2000-01-01T00:00:00.000Z" }, new Date().toISOString());
    await stub.drainParses(new Date(Date.now() + 60_000).toISOString());
    const { state } = await stub.read(new Date().toISOString());
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
