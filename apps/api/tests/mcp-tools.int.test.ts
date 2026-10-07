import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { newId } from "@pace/core";

import { TOOLS } from "../src/mcp/server.ts";
import { json, loginAsDev } from "./helpers.ts";
import { mcpResult, obtainToken } from "./oauth-flow.ts";

const byText = (a: unknown, b: unknown): number => String(a).localeCompare(String(b));

/** Every mutating tool; the contract tests below cover each one. */
const WRITE_TOOLS = [
  "add_subtasks",
  "archive_preset",
  "capture_inbox",
  "close_task",
  "create_preset",
  "create_task",
  "mark_subtasks",
  "reopen",
  "review_action",
  "revoke_event",
  "seed_example_presets",
  "set_importance",
  "set_rank",
  "set_status",
  "submit",
  "update_preset",
  "update_task",
].toSorted(byText);

type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  description?: string;
  inputSchema: { type: string; properties?: Record<string, unknown> };
};
type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
};
type PullResult = {
  events: {
    id: string;
    type: string;
    source: string;
    occurredAt: string;
    precision: string;
    payload: Record<string, unknown>;
  }[];
  seq: number;
};
type Row = Record<string, unknown>;

const READ_WRITE = { scope: "tasks:read tasks:write", scopes: ["tasks:read", "tasks:write"] };

const readWriteToken = async (): Promise<string> =>
  (await obtainToken(READ_WRITE)).tokens.access_token;

const callTool = async (
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> =>
  await mcpResult<ToolResult>(token, "tools/call", { arguments: args, name });

/** A tool result that must have succeeded: its structured content. */
const okTool = async (
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Row> => {
  const result = await callTool(token, name, args);
  if (result.isError === true) {
    throw new Error(`${name} failed: ${result.content[0]?.text ?? ""}`);
  }
  return result.structuredContent ?? {};
};

const errorText = async (
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> => {
  const result = await callTool(token, name, args);
  expect(result.isError).toBe(true);
  return result.content[0]?.text ?? "";
};

const pull = async (): Promise<PullResult> =>
  await json<PullResult>("/api/sync/pull", { token: await loginAsDev("1001") });

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

const createTask = async (token: string, args: Record<string, unknown>): Promise<string> => {
  const result = await okTool(token, "create_task", { title: "A task", ...args });
  return String(result["taskId"]);
};

describe("MCP tools catalogue", () => {
  it("lists every tool with annotations, a title and an LLM-facing description", async () => {
    const token = await readWriteToken();
    const { tools } = await mcpResult<{ tools: Listed[] }>(token, "tools/list");
    const names = tools.map((tool) => tool.name).toSorted(byText);
    expect(names).toEqual(TOOLS.map((tool) => tool.name).toSorted(byText));
    expect(names).toEqual(
      expect.arrayContaining([
        "whoami",
        "list_now",
        "get_task",
        "list_projects",
        "list_project_tasks",
        "list_presets",
        "list_inbox",
        "list_review",
        "search",
        "fetch",
        "create_task",
        "capture_inbox",
        "mark_subtasks",
        "submit",
        "close_task",
        "reopen",
        "update_task",
        "set_importance",
        "set_status",
        "set_rank",
        "add_subtasks",
        "revoke_event",
        "review_action",
        "seed_example_presets",
        "create_preset",
        "update_preset",
        "archive_preset",
      ]),
    );
    const scopeOf = (name: string) => TOOLS.find((item) => item.name === name)?.scope;
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(scopeOf(tool.name) === "tasks:read");
      expect(tool.description?.length ?? 0).toBeGreaterThan(40);
    }
    const writes = tools.filter((tool) => scopeOf(tool.name) === "tasks:write");
    expect(writes.map((tool) => tool.name).toSorted(byText)).toEqual(WRITE_TOOLS);
    for (const tool of writes) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual(
        expect.arrayContaining(["at", "precision", "dryRun"]),
      );
    }
  });
});

describe("create_task", () => {
  it("records a task.created with source mcp that a client pulls and that list_now shows", async () => {
    const token = await readWriteToken();
    const created = await okTool(token, "create_task", {
      dueAt: "2026-12-24T20:59:00.000Z",
      dueTz: "Europe/Moscow",
      estimateMinutes: 90,
      importance: "prioritized",
      presetId: "hw",
      subtasks: ["3", "4", { label: "bonus", number: 7 }],
      title: "Sheet 5",
    });
    expect(created).toMatchObject({
      dryRun: false,
      task: { importance: "prioritized", title: "Sheet 5", total: 3 },
    });
    const taskId = String(created["taskId"]);
    const pulled = await pull();
    const event = pulled.events.find((item) => item.payload["taskId"] === taskId);
    expect(event).toMatchObject({
      payload: { taskId, title: "Sheet 5" },
      source: "mcp",
      type: "task.created",
    });
    expect(rows(event?.payload["subtasks"]).map((item) => [item["label"], item["number"]])).toEqual(
      [
        ["3", 3],
        ["4", 4],
        ["bonus", 7],
      ],
    );

    const now = await okTool(token, "list_now");
    const items = rows(now["items"]);
    expect(items.find((row) => row["id"] === taskId)).toMatchObject({
      dueAt: "2026-12-24T20:59:00.000Z",
      dueTz: "Europe/Moscow",
      id: taskId,
      presetId: "hw",
      solved: 0,
      total: 3,
    });
    expect(typeof now["inboxCount"]).toBe("number");
    expect(typeof now["laterCount"]).toBe("number");
    expect(Array.isArray(now["waiting"])).toBe(true);
  });

  it("creates a project by name once and reuses it (case-insensitively) afterwards", async () => {
    const token = await readWriteToken();
    const first = await okTool(token, "create_task", { projectName: "Algebra", title: "HW 1" });
    const second = await okTool(token, "create_task", { projectName: "algebra ", title: "HW 2" });
    expect(first["projectId"]).toBe(second["projectId"]);
    const projects = rows((await okTool(token, "list_projects"))["projects"]);
    expect(projects.filter((row) => row["name"] === "Algebra")).toEqual([
      expect.objectContaining({ id: first["projectId"], name: "Algebra", openTasks: 2 }),
    ]);
    const pulled = await pull();
    expect(
      pulled.events.filter(
        (event) => event.type === "project.created" && event.payload["name"] === "Algebra",
      ),
    ).toHaveLength(1);
    const view = await okTool(token, "list_project_tasks", { projectName: "ALGEBRA" });
    expect(
      rows(view["open"])
        .map((row) => row["title"])
        .toSorted(byText),
    ).toEqual(["HW 1", "HW 2"]);
    expect(view["stats"]).toMatchObject({ open: 2 });
  });

  it("answers a tool error with the Result code for an unknown preset", async () => {
    const token = await readWriteToken();
    expect(await errorText(token, "create_task", { presetId: "nope", title: "x" })).toContain(
      "preset/unknown",
    );
  });

  it("dryRun previews the events and the resulting task without writing anything", async () => {
    const token = await readWriteToken();
    const before = (await pull()).seq;
    const preview = await okTool(token, "create_task", {
      dryRun: true,
      projectName: "Dry",
      title: "Nothing",
    });
    expect(preview).toMatchObject({ dryRun: true, task: { projectName: "Dry", title: "Nothing" } });
    expect(rows(preview["events"]).map((event) => event["type"])).toEqual([
      "project.created",
      "task.created",
    ]);
    const result = await callTool(token, "create_task", { dryRun: true, title: "Nothing" });
    expect(result.content[0]?.text).toMatch(/dry run/i);
    expect((await pull()).seq).toBe(before);
    expect(
      rows((await okTool(token, "list_now"))["items"]).some((row) => row["title"] === "Nothing"),
    ).toBe(false);
  });

  it("refuses a write with a read-only grant", async () => {
    const { tokens } = await obtainToken({ scope: "tasks:read", scopes: ["tasks:read"] });
    expect(await errorText(tokens.access_token, "create_task", { title: "x" })).toContain(
      '"tasks:write"',
    );
    expect(Array.isArray((await okTool(tokens.access_token, "list_now"))["items"])).toBe(true);
  });
});

describe("inbox", () => {
  it("captures text into the inbox and lists it with a suggestion", async () => {
    const token = await readWriteToken();
    const captured = await okTool(token, "capture_inbox", {
      text: "work: review the dashboard PR tomorrow",
    });
    const inbox = await okTool(token, "list_inbox");
    const items = rows(inbox["items"]);
    expect(items.find((row) => row["id"] === captured["taskId"])).toMatchObject({
      id: captured["taskId"],
      suggestion: { presetId: "work" },
      text: "work: review the dashboard PR tomorrow",
      unsortedTooLong: false,
    });
    expect(Number((await okTool(token, "list_now"))["inboxCount"])).toBeGreaterThanOrEqual(1);
  });
});

describe("progress and closing", () => {
  it("marks subtasks by number and submitting the last unsubmitted one closes the task", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, {
      presetId: "hw",
      subtasks: ["1", "2", "3"],
      title: "Sheet",
    });
    const marked = await okTool(token, "mark_subtasks", { numbers: [1, 2], taskId });
    expect(rows(marked["solved"])).toHaveLength(2);
    expect(marked["task"]).toMatchObject({ solved: 2, status: "in_progress", total: 3 });

    const partial = await okTool(token, "submit", { taskId });
    expect(partial).toMatchObject({ closed: false });
    expect(rows(partial["submittedSubtaskIds"])).toHaveLength(2);

    await okTool(token, "mark_subtasks", { numbers: [3], taskId });
    const final = await okTool(token, "submit", { taskId });
    expect(final).toMatchObject({ closed: true, task: { status: "in_progress", submitted: 3 } });
    const view = await okTool(token, "get_task", { id: taskId });
    expect(view).toMatchObject({ closed: { outcome: "done" }, outcome: "done" });
    expect(rows(view["subtasks"]).every((row) => row["submittedAt"] !== null)).toBe(true);
    expect(await errorText(token, "mark_subtasks", { numbers: [1], taskId })).toContain(
      "retro/task-closed",
    );
  });

  it("submits a whole-submission task as done, reopens and closes it as cancelled", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, { presetId: "work", title: "Ticket" });
    expect(await okTool(token, "submit", { taskId })).toMatchObject({ closed: true });
    expect(await okTool(token, "reopen", { taskId })).toMatchObject({
      task: { status: "not_started" },
    });
    const closed = await okTool(token, "close_task", {
      outcome: "cancelled",
      reason: "moved",
      taskId,
    });
    expect(closed).toMatchObject({ outcome: "cancelled" });
    const view = await okTool(token, "get_task", { id: taskId });
    expect(view).toMatchObject({
      closed: { outcome: "cancelled", reason: "moved" },
      outcome: "cancelled",
    });
  });

  it("refuses to submit when nothing is solved, with the Result code", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, { presetId: "hw", subtasks: ["1"], title: "Sheet" });
    expect(await errorText(token, "submit", { taskId })).toContain("retro/nothing-to-submit");
    expect(await errorText(token, "mark_subtasks", { subtaskIds: ["ghost"], taskId })).toContain(
      "subtask/unknown",
    );
    expect(await errorText(token, "get_task", { id: "ghost" })).toContain("task/unknown");
  });
});

describe("at and precision", () => {
  const HOUR = 3_600_000;
  const hoursFromNow = (hours: number): string => new Date(Date.now() + hours * HOUR).toISOString();

  it("records a retroactive instant with its precision and refuses what the retro rules forbid", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, {
      at: hoursFromNow(-2),
      presetId: "hw",
      subtasks: ["1", "2"],
      title: "Sheet",
    });
    const at = hoursFromNow(-1);
    const marked = await okTool(token, "mark_subtasks", {
      at,
      numbers: [1],
      precision: "approx",
      taskId,
    });
    const [solve] = rows(marked["events"]);
    expect(solve).toMatchObject({ occurredAt: at, type: "task.subtask.solved" });
    const stored = (await pull()).events.find((event) => event.id === solve?.["id"]);
    expect(stored).toMatchObject({ occurredAt: at, precision: "approx", source: "mcp" });
    expect(
      await errorText(token, "mark_subtasks", { at: hoursFromNow(-3), numbers: [2], taskId }),
    ).toContain("retro/before-created");
    expect(
      await errorText(token, "mark_subtasks", { at: hoursFromNow(24), numbers: [2], taskId }),
    ).toContain("retro/future");
    expect(await okTool(token, "get_task", { id: taskId })).toMatchObject({ solved: 1 });
  });
});

describe("editing", () => {
  it("updates fields, importance, status, estimate, preset and project", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, { title: "Draft" });
    const updated = await okTool(token, "update_task", {
      description: "details",
      dueAt: "2026-12-01T10:00:00.000Z",
      estimateMinutes: 45,
      presetId: "work",
      projectName: "Side",
      taskId,
      title: "Final",
    });
    expect(
      rows(updated["events"])
        .map((event) => event["type"])
        .toSorted(byText),
    ).toEqual([
      "project.created",
      "task.estimate.set",
      "task.preset.set",
      "task.project.set",
      "task.updated",
    ]);
    await okTool(token, "set_importance", { importance: "asap", taskId });
    await okTool(token, "set_status", { status: "waiting", taskId });
    const view = await okTool(token, "get_task", { id: taskId });
    expect(view).toMatchObject({
      description: "details",
      dueAt: "2026-12-01T10:00:00.000Z",
      dueTz: "UTC",
      estimateMinutes: 45,
      importance: "asap",
      presetId: "work",
      projectName: "Side",
      status: "waiting",
      title: "Final",
    });
    const now = await okTool(token, "list_now");
    expect(rows(now["waiting"]).map((row) => row["id"])).toContain(taskId);
  });

  it("adds subtasks and renumbers the category on set_rank", async () => {
    const token = await readWriteToken();
    const [a, b, c] = [
      await createTask(token, { title: "A" }),
      await createTask(token, { title: "B" }),
      await createTask(token, { title: "C" }),
    ];
    const added = await okTool(token, "add_subtasks", {
      labels: ["x", { label: "y", number: 9 }],
      taskId: a,
    });
    expect(rows(added["added"]).map((row) => [row["label"], row["number"]])).toEqual([
      ["x", null],
      ["y", 9],
    ]);
    const ranked = await okTool(token, "set_rank", { position: 1, taskId: c });
    const order = strings(ranked["order"]);
    expect(order[0]).toBe(c);
    expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
    expect(ranked["position"]).toBe(1);
    const types = rows(ranked["events"]).map((event) => event["type"]);
    expect(types.length).toBeGreaterThanOrEqual(1);
    expect(new Set(types)).toEqual(new Set(["task.rank.set"]));
    const last = await okTool(token, "set_rank", { position: order.length, taskId: c });
    expect(strings(last["order"]).at(-1)).toBe(c);
    const now = await okTool(token, "list_now");
    const ids = strings(rows(now["items"]).map((row) => row["id"]));
    expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b));
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(c));
  });

  it("revokes an event by id and refuses an unknown one", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, { presetId: "hw", subtasks: ["1"], title: "Sheet" });
    const marked = await okTool(token, "mark_subtasks", { numbers: [1], taskId });
    const solveId = String(rows(marked["events"])[0]?.["id"]);
    const revoked = await okTool(token, "revoke_event", { eventId: solveId, reason: "mistake" });
    expect(revoked).toMatchObject({ targetId: solveId, targetType: "task.subtask.solved" });
    expect(await okTool(token, "get_task", { id: taskId })).toMatchObject({ progress: 0 });
    expect(await errorText(token, "revoke_event", { eventId: newId() })).toContain(
      "event/not-found",
    );
  });
});

describe("review", () => {
  it("lists review items with action keys and runs one of them", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, {
      at: "2026-09-01T10:00:00.000Z",
      dueAt: "2026-09-10T10:00:00.000Z",
      dueTz: "UTC",
      title: "Old",
    });
    const review = await okTool(token, "list_review");
    const items = rows(review["items"]);
    expect(
      items.some((item) => item["kind"] === "confirm-auto-outcome" && item["taskId"] === taskId),
    ).toBe(true);
    const item = items.find((entry) => entry["taskId"] === taskId);
    expect(item?.["actions"]).toEqual(["confirm", "undo"]);
    const done = await okTool(token, "review_action", { key: "undo", taskId });
    expect(rows(done["events"]).map((event) => event["type"])).toEqual(["event.revoked"]);
    expect(await okTool(token, "get_task", { id: taskId })).toMatchObject({ closed: null });
    expect(await errorText(token, "review_action", { key: "confirm", taskId })).toContain(
      "review/no-action",
    );
    const fresh = await createTask(token, { title: "Fresh" });
    expect(await errorText(token, "review_action", { key: "undo", taskId: fresh })).toContain(
      "review/no-item",
    );
  });
});

describe("presets", () => {
  it("seeds the example presets once, lists them resolved, edits and archives one", async () => {
    const token = await readWriteToken();
    const seeded = await okTool(token, "seed_example_presets");
    expect(seeded).toMatchObject({
      created: ["hw.algebra", "hw.calculus", "hw.history"],
      skipped: [],
    });
    expect(await okTool(token, "seed_example_presets")).toMatchObject({
      created: [],
      skipped: ["hw.algebra", "hw.calculus", "hw.history"],
    });
    const listed = rows((await okTool(token, "list_presets"))["presets"]);
    const algebra = listed.find((preset) => preset["id"] === "hw.algebra");
    expect(algebra).toMatchObject({
      builtIn: false,
      extends: "hw",
      resolved: { submission: "per_subtask", urgencyPolicy: "resubmission" },
    });
    expect(listed.find((preset) => preset["id"] === "hw")).toMatchObject({ builtIn: true });

    await okTool(token, "create_preset", {
      definition: { defaultEstimateMinutes: 20 },
      extends: "work",
      id: "work.ops",
      name: "Ops",
    });
    expect(
      await errorText(token, "create_preset", {
        definition: {},
        extends: "work",
        id: "work.ops",
        name: "Dup",
      }),
    ).toContain("preset/exists");
    expect(
      await errorText(token, "create_preset", {
        definition: { bogus: 1 },
        extends: "work",
        id: "work.x",
        name: "X",
      }),
    ).toContain("preset/invalid-definition");
    await okTool(token, "update_preset", { id: "work.ops", name: "Operations" });
    await okTool(token, "archive_preset", { id: "work.ops" });
    const after = rows((await okTool(token, "list_presets"))["presets"]);
    expect(after.find((preset) => preset["id"] === "work.ops")).toMatchObject({
      archived: true,
      name: "Operations",
    });
    expect(await errorText(token, "archive_preset", { id: "hw" })).toContain("preset/built-in");
  });
});

describe("search and fetch", () => {
  it("finds tasks, subtasks and projects by a Cyrillic query and fetches the documents", async () => {
    const token = await readWriteToken();
    const taskId = await createTask(token, {
      description: "Решить номера 3 и 4",
      presetId: "hw",
      projectName: "Алгебра",
      subtasks: ["Задача 3"],
      title: "ДЗ по алгебре",
    });
    const other = await createTask(token, { projectName: "Work", title: "Unrelated" });
    const found = rows((await okTool(token, "search", { query: "алгебр" }))["results"]);
    expect(found.map((row) => row["id"]).toSorted(byText)).not.toContain(other);
    expect(found.find((row) => row["id"] === taskId)).toMatchObject({
      title: "ДЗ по алгебре",
      url: `${env.WEB_ORIGIN}/task/${taskId}`,
    });
    const project = found.find((row) => row["title"] === "Алгебра");
    expect(String(project?.["url"])).toBe(`${env.WEB_ORIGIN}/projects/${String(project?.["id"])}`);
    expect(
      rows((await okTool(token, "search", { query: "ЗАДАЧА" }))["results"]).map((row) => row["id"]),
    ).toEqual([taskId]);

    const document = await okTool(token, "fetch", { id: taskId });
    expect(document).toMatchObject({
      id: taskId,
      title: "ДЗ по алгебре",
      url: `${env.WEB_ORIGIN}/task/${taskId}`,
    });
    expect(String(document["text"])).toContain("Задача 3");
    expect(String(document["text"])).toContain("Решить номера 3 и 4");
    const projectDocument = await okTool(token, "fetch", { id: String(project?.["id"]) });
    expect(String(projectDocument["text"])).toContain("ДЗ по алгебре");
    expect(await errorText(token, "fetch", { id: "ghost" })).toContain("not-found");
  });
});

/** What the contract tests act on: one task per situation a write tool needs. */
type Fixture = {
  /** An open homework task: problem 1 solved, problem 2 open. */
  readonly taskId: string;
  /** The event that solved problem 1. */
  readonly solveId: string;
  /** A task whose deadline passed: closed as missed, with a review item to confirm. */
  readonly missedId: string;
  /** A user preset. */
  readonly presetId: string;
};

const writeFixture = async (token: string): Promise<Fixture> => {
  const taskId = await createTask(token, {
    presetId: "hw",
    subtasks: ["1", "2"],
    title: "Contract sheet",
  });
  const marked = await okTool(token, "mark_subtasks", { numbers: [1], taskId });
  const missedId = await createTask(token, {
    at: "2026-09-01T10:00:00.000Z",
    dueAt: "2026-09-10T10:00:00.000Z",
    dueTz: "UTC",
    title: "Contract missed",
  });
  const presetId = `work.c${newId().toLowerCase()}`;
  await okTool(token, "create_preset", {
    definition: {},
    extends: "work",
    id: presetId,
    name: "Contract",
  });
  return { missedId, presetId, solveId: String(rows(marked["events"])[0]?.["id"]), taskId };
};

/** Arguments every write tool accepts against the fixture. */
const writeArgs = (fixture: Fixture): Record<string, Record<string, unknown>> => ({
  add_subtasks: { labels: ["3"], taskId: fixture.taskId },
  archive_preset: { id: fixture.presetId },
  capture_inbox: { text: "Contract capture" },
  close_task: { outcome: "skipped", taskId: fixture.taskId },
  create_preset: {
    definition: {},
    extends: fixture.presetId,
    id: `${fixture.presetId}.x`,
    name: "X",
  },
  create_task: { projectName: "Contract project", title: "Contract task" },
  mark_subtasks: { numbers: [2], taskId: fixture.taskId },
  reopen: { taskId: fixture.missedId },
  review_action: { key: "confirm", taskId: fixture.missedId },
  revoke_event: { eventId: fixture.solveId },
  seed_example_presets: {},
  set_importance: { importance: "asap", taskId: fixture.taskId },
  set_rank: { position: 1, taskId: fixture.taskId },
  set_status: { status: "paused", taskId: fixture.taskId },
  submit: { taskId: fixture.taskId },
  update_preset: { id: fixture.presetId, name: "Renamed" },
  update_task: { taskId: fixture.taskId, title: "Renamed" },
});

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString();

/** One refusal per write tool and the Result code it answers (seeding skips, it never refuses). */
const refusals = (
  fixture: Fixture,
): Record<string, readonly [Record<string, unknown>, string]> => ({
  add_subtasks: [{ labels: ["3"], taskId: "ghost" }, "task/unknown"],
  archive_preset: [{ id: "hw" }, "preset/built-in"],
  capture_inbox: [{ text: ' '.repeat(3) }, "inbox/empty"],
  close_task: [{ outcome: "done", taskId: "ghost" }, "task/unknown"],
  create_preset: [
    { definition: {}, extends: "nope", id: "work.orphan", name: "Orphan" },
    "preset/unknown-parent",
  ],
  create_task: [{ presetId: "nope", title: "x" }, "preset/unknown"],
  mark_subtasks: [{ numbers: [9], taskId: fixture.taskId }, "subtask/unknown"],
  reopen: [{ at: tomorrow(), taskId: fixture.missedId }, "retro/future"],
  review_action: [{ key: "undo", taskId: fixture.taskId }, "review/no-item"],
  revoke_event: [{ eventId: "ghost" }, "event/not-found"],
  set_importance: [{ importance: "asap", taskId: "ghost" }, "task/unknown"],
  set_rank: [{ position: 1, taskId: fixture.missedId }, "rank/not-competing"],
  set_status: [{ status: "paused", taskId: fixture.missedId }, "retro/task-closed"],
  submit: [{ taskId: fixture.missedId }, "retro/task-closed"],
  update_preset: [{ id: "nope", name: "x" }, "preset/unknown"],
  update_task: [
    { at: "2020-01-01T00:00:00.000Z", taskId: fixture.taskId, title: "x" },
    "retro/before-created",
  ],
});

/** The caller's Durable Object, to count the log around calls that must not write. */
const logOf = async (token: string) => {
  const me = await okTool(token, "whoami");
  const store = env.USER_STORE.get(env.USER_STORE.idFromName(String(me["userId"])));
  // A read derives the system events due by now first, so the count only moves on a write.
  await okTool(token, "list_now");
  return { count: async () => await store.countEvents() };
};

describe("every write tool", () => {
  it("covers the whole write catalogue in the contract fixtures", () => {
    const fixture: Fixture = { missedId: "m", presetId: "p", solveId: "s", taskId: "t" };
    expect(Object.keys(writeArgs(fixture)).toSorted(byText)).toEqual(WRITE_TOOLS);
    expect(Object.keys(refusals(fixture)).toSorted(byText)).toEqual(
      WRITE_TOOLS.filter((name) => name !== "seed_example_presets"),
    );
  });

  it("previews with dryRun and writes nothing", async () => {
    const token = await readWriteToken();
    const fixture = await writeFixture(token);
    const log = await logOf(token);
    const before = await log.count();
    for (const [name, args] of Object.entries(writeArgs(fixture))) {
      const result = await callTool(token, name, { ...args, dryRun: true });
      expect(result.isError, `${name}: ${result.content[0]?.text ?? ""}`).toBeUndefined();
      expect(result.structuredContent?.["dryRun"], name).toBe(true);
      expect(result.content[0]?.text, name).toMatch(/^Dry run: nothing was written\./u);
    }
    expect(await log.count()).toBe(before);
  });

  it("is refused with a read-only grant, before anything is written", async () => {
    const token = await readWriteToken();
    const fixture = await writeFixture(token);
    const { tokens } = await obtainToken({ scope: "tasks:read", scopes: ["tasks:read"] });
    const log = await logOf(token);
    const before = await log.count();
    for (const [name, args] of Object.entries(writeArgs(fixture))) {
      expect(await errorText(tokens.access_token, name, args), name).toContain('"tasks:write"');
    }
    expect(await log.count()).toBe(before);
  });

  it("answers a refusal as an isError result that starts with the Result code", async () => {
    const token = await readWriteToken();
    const fixture = await writeFixture(token);
    const log = await logOf(token);
    const before = await log.count();
    for (const [name, [args, code]] of Object.entries(refusals(fixture))) {
      const result = await callTool(token, name, args);
      expect(result.isError, name).toBe(true);
      expect(result.content[0]?.text?.split(": ", 1)[0], name).toBe(code);
      expect(result.structuredContent, name).toMatchObject({ error: { code } });
    }
    expect(await log.count()).toBe(before);
  });
});
