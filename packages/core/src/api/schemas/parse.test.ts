import { describe, expect, it } from "vitest";

import { ParseRequestSchema, ParseResponseSchema } from "./parse.ts";

/** An answer a newer server could send: keys this client does not know yet, at every level. */
const newer = {
  confidence: 1,
  domain: "task",
  extra: "top",
  actions: [
    {
      extra: "action",
      kind: "task.create",
      summary: "New task: x",
      task: {
        description: null,
        dueAt: null,
        dueTz: null,
        estimateMinutes: null,
        extra: "draft",
        importance: null,
        link: null,
        presetId: "personal",
        projectId: null,
        projectName: null,
        sourceText: "x",
        subtasks: [{ extra: "subtask", label: "a", number: null }],
        title: "x",
      },
    },
    {
      extra: "action",
      kind: "task.update",
      patch: {
        due: { at: "2026-10-09T20:59:00.000Z", extra: "due", tz: "UTC" },
        extra: "patch",
        subtasks: { extra: "edits", rename: [{ extra: "rename", label: "b", subtaskId: "s1" }] },
      },
      summary: "Change",
      taskId: "t1",
    },
    {
      activityId: "a1",
      kind: "activity.update",
      patch: { extra: "patch", label: "y" },
      summary: "Change",
    },
  ],
  provider: "fake",
  questions: [{ extra: "question", field: "title", options: [], question: "?" }],
  status: "parsed",
};

describe("the parse answer", () => {
  it("accepts a bounded follow-up thread but rejects untrusted extra fields", () => {
    const thread = [{ text: "move it to Friday", actions: newer.actions }];
    expect(
      ParseRequestSchema.safeParse({ domain: "task", text: "Saturday instead", thread }).success,
    ).toBe(true);
    expect(
      ParseRequestSchema.safeParse({
        text: "x",
        thread: Array.from({ length: 6 }, () => thread[0]),
      }).success,
    ).toBe(false);
    expect(
      ParseRequestSchema.safeParse({ text: "x", thread: [{ ...thread[0], extra: 1 }] }).success,
    ).toBe(false);
  });
  it("is read by an older client: keys it does not know are dropped, not refused", () => {
    const read = ParseResponseSchema.safeParse(newer);
    expect(read.success).toBe(true);
    expect(JSON.stringify(read.data)).not.toContain("extra");
  });

  it("keeps the request strict: the server refuses keys it does not know", () => {
    expect(ParseRequestSchema.safeParse({ extra: 1, text: "x" }).success).toBe(false);
  });
});
