import { describe, expect, it } from "vitest";

import { blankModelAction, type EventInput, type ModelOutput } from "@pace/core";
import { artboardState, NOW, REPLY_ID } from "@pace/core/testing";

import type { BotStoreApi, DecisionAnswer, DecisionEntry, JsonValue } from "../shared/contract.ts";
import type { BotReply, Turn } from "./turn.ts";

import { echoReply, fakeParseModel } from "../shared/llm/fake-model.ts";
import { PREVIEW_ACTIONS } from "./preview-buttons.ts";
import { choosePreview, preview } from "./preview.ts";

/** A store in memory: what the bot remembers, and every batch it writes. */
const memoryStore = () => {
  const kept = new Map<string, JsonValue>();
  const written: (readonly EventInput[])[] = [];
  const logged: DecisionEntry[] = [];
  const resolved: DecisionAnswer[] = [];
  const store = {
    apply: async (inputs: readonly EventInput[]) => {
      await Promise.resolve();
      written.push(inputs);
      return { ok: true, value: { events: [], seq: 0, state: artboardState() } };
    },
    enqueueParse: async () => {
      await Promise.resolve();
    },
    llmCooldowns: async () => ({}),
    logDecisions: async (entries: readonly DecisionEntry[]) => {
      await Promise.resolve();
      logged.push(...entries);
    },
    noteLlmLimits: async () => {
      await Promise.resolve();
    },
    peek: async (key: string) => kept.get(key),
    recall: async (key: string) => {
      const value = kept.get(key);
      kept.delete(key);
      return value;
    },
    remember: async (key: string, value: JsonValue) => {
      await Promise.resolve();
      kept.set(key, value);
    },
    resolveDecisions: async (answers: readonly DecisionAnswer[]) => {
      await Promise.resolve();
      resolved.push(...answers);
      return answers.length;
    },
  } as unknown as BotStoreApi;
  return { kept, logged, resolved, store, written };
};

const LATER = "2026-10-06T12:30:00.000Z";

describe("the bot's preview", () => {
  it("writes what was accepted at the moment of Accept, not when it was previewed", async () => {
    const { store, written } = memoryStore();
    const turn = (now: string): Turn => ({ now, state: artboardState(now), store });
    const shown = await preview(
      turn(NOW),
      [{ model: fakeParseModel(echoReply), name: "fake" }],
      "close task Reply to course curator",
    );
    const accept = shown.buttons[0]?.find(
      (button) => "data" in button && button.data.startsWith("a:"),
    );
    expect(accept).toBeDefined();
    const id = accept !== undefined && "data" in accept ? accept.data.slice(2) : "";
    expect(written).toEqual([]);
    await choosePreview(turn(LATER), [{ model: fakeParseModel(echoReply), name: "fake" }], {
      action: PREVIEW_ACTIONS.accept,
      id,
    });
    expect(written).toEqual([
      [
        expect.objectContaining({
          occurredAt: LATER,
          payload: { outcome: "done", taskId: REPLY_ID },
          type: "task.closed",
        }),
      ],
    ]);
  });
});

/** A model that asks two questions about a new task, the first with options; it notes what it read. */
const askingModel = () => {
  const read: { readonly text: string; readonly system: string }[] = [];
  const reply = (text: string, system: string): ModelOutput => {
    read.push({ system, text });
    return {
      actions: [blankModelAction({ kind: "task.create", title: "Съездить в банк" })],
      confidence: 1,
      domain: "task",
      questions: [
        {
          field: "dueDate",
          options: ["Today", "Tomorrow"],
          question: "By when does this need to be done?",
        },
        { field: "category", options: [], question: "Is this for work or home?" },
      ],
    };
  };
  return { providers: [{ model: fakeParseModel(reply), name: "fake" }], read };
};

/** Every button of a reply with callback data: its label and data. */
const buttonsOf = (reply: BotReply) =>
  reply.buttons
    .flat()
    .filter((button) => "data" in button)
    .map((button) => ({ data: button.data, label: button.label }));

/** Two questions with options: the second's buttons must say which question they answer. */
const twoAsked = (): ModelOutput => ({
  actions: [blankModelAction({ kind: "task.create", title: "Съездить в банк" })],
  confidence: 1,
  domain: "task",
  questions: [
    { field: "dueDate", options: ["Today"], question: "When?" },
    { field: "category", options: ["Work", "Home"], question: "Work or home?" },
  ],
});

describe("the bot's answers to the assistant's questions", () => {
  it("offers a question's options as buttons that point at them by index, never by text", async () => {
    const { kept, store } = memoryStore();
    const { providers } = askingModel();
    const shown = await preview(
      { now: NOW, state: artboardState(NOW), store },
      providers,
      "Съездить в банк",
    );
    const id = shown.pendingId ?? "";
    const buttons = buttonsOf(shown);
    expect(buttons.map((button) => button.label)).toEqual([
      "Today",
      "Tomorrow",
      "Approve",
      "To Inbox",
      "Cancel",
    ]);
    expect(buttons.slice(0, 2).map((button) => button.data)).toEqual([
      `${PREVIEW_ACTIONS.answer}00:${id}`,
      `${PREVIEW_ACTIONS.answer}01:${id}`,
    ]);
    for (const button of buttons) {
      expect(new TextEncoder().encode(button.data).length).toBeLessThanOrEqual(64);
    }
    expect(shown.text).toContain("Question: By when does this need to be done?");
    expect(shown.text).toContain("Question: Is this for work or home?");
    expect(shown.text).toContain("Tap an answer below or reply with a correction.");
    // The questions are kept with the preview, so a press can be checked against them.
    expect(kept.get(id)).toMatchObject({
      questions: [{ options: ["Today", "Tomorrow"] }, { options: [] }],
    });
  });

  it("numbers the questions and their buttons when more than one has options", async () => {
    const { store } = memoryStore();
    const shown = await preview(
      { now: NOW, state: artboardState(NOW), store },
      [{ model: fakeParseModel(twoAsked), name: "fake" }],
      "Съездить в банк",
    );
    expect(shown.text).toContain("Question 1: When?");
    expect(shown.text).toContain("Question 2: Work or home?");
    expect(
      buttonsOf(shown)
        .map((button) => button.label)
        .slice(0, 3),
    ).toEqual(["1. Today", "2. Work", "2. Home"]);
  });

  it("sends a pressed option as the same correction a typed reply makes, the question quoted", async () => {
    const { kept, store } = memoryStore();
    const { providers, read } = askingModel();
    const turn: Turn = { now: NOW, state: artboardState(NOW), store };
    const shown = await preview(turn, providers, "Съездить в банк");
    const id = shown.pendingId ?? "";
    const revised = await choosePreview(turn, providers, {
      action: `${PREVIEW_ACTIONS.answer}01`,
      id,
    });
    expect(read.at(-1)?.text).toBe("«By when does this need to be done?» — Tomorrow");
    expect(read.at(-1)?.system).toContain("1. Owner: Съездить в банк");
    // A new preview replaces the answered one, which is gone.
    expect(revised.pendingId).toBeDefined();
    expect(revised.pendingId).not.toBe(id);
    expect(revised.isRefused).toBeUndefined();
    expect(kept.has(id)).toBe(false);
    expect(kept.get(revised.pendingId ?? "")).toMatchObject({
      request: "Съездить в банк",
      text: "«By when does this need to be done?» — Tomorrow",
      thread: [{ text: "Съездить в банк" }],
    });
  });

  it("drops a revision when Approve took the preview while it was being read", async () => {
    const { kept, store, written } = memoryStore();
    const { providers } = askingModel();
    const slow = [{ model: fakeParseModel(twoAsked, { firstTokenAfterMs: 50 }), name: "slow" }];
    const turn: Turn = { now: NOW, state: artboardState(NOW), store };
    const shown = await preview(turn, providers, "Съездить в банк");
    const id = shown.pendingId ?? "";
    const revising = choosePreview(turn, slow, { action: `${PREVIEW_ACTIONS.answer}01`, id });
    // Approve lands while the revision waits for the model.
    await new Promise((resolve) => setTimeout(resolve, 15));
    await choosePreview(turn, providers, { action: PREVIEW_ACTIONS.accept, id });
    const revised = await revising;
    expect(written).toHaveLength(1);
    expect(revised.pendingId).toBeUndefined();
    expect(revised.isRefused).toBe(true);
    expect(revised.text).toBe("This preview has expired. Send the message again.");
    // No preview is left behind: only the bot's message bindings remain.
    for (const key of kept.keys()) {
      expect(key).toMatch(/^bot:/u);
    }
  });

  it("answers a stale or forged press with a toast, asks nothing and keeps the message", async () => {
    const { kept, store } = memoryStore();
    const { providers, read } = askingModel();
    const turn: Turn = { now: NOW, state: artboardState(NOW), store };
    const shown = await preview(turn, providers, "Съездить в банк");
    const id = shown.pendingId ?? "";
    const asked = read.length;
    for (const press of [
      { action: `${PREVIEW_ACTIONS.answer}02`, id },
      { action: `${PREVIEW_ACTIONS.answer}10`, id },
      { action: `${PREVIEW_ACTIONS.answer}90`, id },
      { action: `${PREVIEW_ACTIONS.answer}00`, id: "01JUNKNOWNPREVIEW000000000" },
    ]) {
      expect(await choosePreview(turn, providers, press)).toEqual({
        buttons: [],
        isToast: true,
        text: "This preview has expired. Send the message again.",
      });
    }
    expect(read).toHaveLength(asked);
    // The real preview is still there to answer or approve.
    expect(kept.has(id)).toBe(true);
  });
});

const providers = () => askingModel().providers;

describe("what the bot tells the decision log", () => {
  it("records an Accept on the reading's decision, with the task it created", async () => {
    const { logged, resolved, store, written } = memoryStore();
    const turn: Turn = { now: NOW, state: artboardState(NOW), store };
    const shown = await preview(turn, providers(), "Съездить в банк");
    const decisionId = logged[0]?.id;
    expect(decisionId).toBeDefined();
    await choosePreview(turn, providers(), {
      action: PREVIEW_ACTIONS.accept,
      id: shown.pendingId ?? "",
    });
    const created = written[0]?.find((input) => input.type === "task.created");
    expect(created?.type === "task.created" && created.payload.taskId).toBeTruthy();
    expect(resolved).toEqual([
      {
        id: decisionId,
        resolution: "approved",
        taskId: created?.type === "task.created" ? created.payload.taskId : "",
      },
    ]);
  });

  it("records Cancel and To Inbox, and a corrected reading as corrected", async () => {
    for (const [action, resolution] of [
      [PREVIEW_ACTIONS.cancel, "cancelled"],
      [PREVIEW_ACTIONS.inbox, "inbox"],
    ] as const) {
      const { logged, resolved, store } = memoryStore();
      const turn: Turn = { now: NOW, state: artboardState(NOW), store };
      const shown = await preview(turn, providers(), "Съездить в банк");
      const revised = await choosePreview(turn, providers(), {
        action: `${PREVIEW_ACTIONS.answer}01`,
        id: shown.pendingId ?? "",
      });
      await choosePreview(turn, providers(), { action, id: revised.pendingId ?? "" });
      expect(logged).toHaveLength(2);
      expect(resolved).toEqual([
        { id: logged[0]?.id, resolution: "corrected" },
        { id: logged[1]?.id, resolution },
      ]);
    }
  });
});
