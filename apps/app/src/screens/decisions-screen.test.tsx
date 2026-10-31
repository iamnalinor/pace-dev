import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { BOOKS_ID } from "@pace/core/testing";

import { DecisionsScreen } from "./decisions-screen.tsx";

const NO_STEP = {
  activityId: null,
  closeOutcome: null,
  fields: [],
  startAt: null,
  subject: null,
  taskId: null,
};

const notification = {
  at: "2026-10-06T11:00:00.000Z",
  explanation: "A digest window.",
  id: "d1",
  inputs: {},
  kind: "notification",
  outcome: "suppressed",
  rule: "digest",
  taskId: null,
};

const reading = {
  at: "2026-10-06T10:00:00.000Z",
  explanation: "Parsed by compatible; not found in the text: project, subtasks.",
  id: "d2",
  inputs: {
    actions: ["The assistant will create “Buy cable”"],
    channel: "api",
    doubtful: ["project", "subtasks"],
    steps: [{ ...NO_STEP, kind: "task.create", subject: "Buy cable" }],
    text: "buy cable tomorrow",
  },
  kind: "parse",
  outcome: "parsed",
  rule: "parse.task.create",
  taskId: null,
};

const moved = {
  ...reading,
  explanation: "Parsed by gpt-5.6-luna#2; every field matched the text.",
  id: "d3",
  inputs: {
    actions: ["The assistant will change “Return library books”: due date"],
    doubtful: [],
    provider: "gpt-5.6-luna#2",
    steps: [{ ...NO_STEP, fields: ["dueDate"], kind: "task.update", taskId: BOOKS_ID }],
    text: "books by friday",
  },
  rule: "parse.task.update",
};

describe("DecisionsScreen", () => {
  it("lists the decision log and searches it", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/decisions": ({ url }) => ({
          decisions: url.searchParams.get("q") === "nothing" ? [] : [notification],
        }),
      },
    });
    await renderScreen(<DecisionsScreen />, runtime);
    expect(await screen.findByText("Notification held back")).toBeOnTheScreen();
    expect(screen.getByText("A digest window.")).toBeOnTheScreen();
    const search = screen.getByLabelText(en("decisions.search"));
    await fireEvent.changeText(search, "nothing");
    await fireEvent(search, "submitEditing");
    expect(await screen.findByText(en("decisions.empty"))).toBeOnTheScreen();
  });

  it("says what the assistant did with each message, in words, with what was typed", async () => {
    const runtime = await createTestRuntime({
      routes: { "GET /api/decisions": () => ({ decisions: [reading, moved] }) },
    });
    await renderScreen(<DecisionsScreen />, runtime);
    expect(await screen.findByText("Suggested a new task “Buy cable”")).toBeOnTheScreen();
    expect(screen.getByText("You wrote: “buy cable tomorrow”")).toBeOnTheScreen();
    expect(screen.getAllByText("Shown to you for approval")).toHaveLength(2);
    expect(screen.getByText("Not in your text: project, subtasks")).toBeOnTheScreen();
    expect(screen.getByText(/via the assistant model/u)).toBeOnTheScreen();
    expect(screen.getByText(/via gpt-5\.6-luna$/u)).toBeOnTheScreen();
    for (const raw of [/parse\.task/u, /compatible/u, /Parsed by/u, /#2/u]) {
      expect(screen.queryByText(raw)).toBeNull();
    }
    // A row about an existing task opens it; one with nothing to open is not a button.
    const books = screen.getByRole("button", {
      name: /Suggested moving the deadline of “Return library books”/u,
    });
    await fireEvent.press(books);
    expect(router.push).toHaveBeenCalledWith(`/task/${BOOKS_ID}`);
    expect(screen.queryByRole("button", { name: /Buy cable/u })).toBeNull();
  });

  it("says what the person did with a reading when the log was told", async () => {
    const dismissed = { ...reading, id: "d4", resolution: "cancelled" };
    const runtime = await createTestRuntime({
      routes: { "GET /api/decisions": () => ({ decisions: [dismissed] }) },
    });
    await renderScreen(<DecisionsScreen />, runtime);
    expect(await screen.findByText("You dismissed it; nothing was done")).toBeOnTheScreen();
    expect(screen.getByText("Suggested a new task “Buy cable”")).toBeOnTheScreen();
  });
});
