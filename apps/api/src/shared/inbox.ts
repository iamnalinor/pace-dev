import { type EventBody, newId } from "@pace/core";

/** The text, kept verbatim as an Inbox item. */
export const inboxBody = (text: string): EventBody => ({
  payload: {
    fields: {},
    importance: "nice_to_have",
    presetId: "inbox",
    sourceText: text,
    subtasks: [],
    taskId: newId(),
    title: text,
  },
  type: "task.created",
});
