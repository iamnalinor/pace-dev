import { err, type EventInput, newId, type Suggestion, type Task } from "@pace/core";

import { type ActionDeps, type ActionResult, emit, fromStore, stamp, taskOf } from "./deps.ts";

export type InboxActions = {
  /** The text is kept verbatim as the title and the source of the item. */
  readonly captureInbox: (text: string, at?: string) => ActionResult;
  /** Sorts an item: preset, project, importance and due from the suggestion, with the user's changes. */
  readonly acceptSuggestion: (
    taskId: string,
    suggestion: Suggestion,
    overrides?: Partial<Suggestion>,
  ) => ActionResult;
  /** An untouched capture is revoked (it never existed); one with a history is closed as skipped. */
  readonly discardInbox: (taskId: string) => ActionResult;
};

const sortingEvents = (deps: ActionDeps, task: Task, sorted: Suggestion): readonly EventInput[] => {
  const taskId = task.id;
  return [
    ...(sorted.presetId === task.presetId
      ? []
      : [stamp(deps, { type: "task.preset.set", payload: { taskId, presetId: sorted.presetId } })]),
    ...(sorted.projectId === null || sorted.projectId === task.projectId
      ? []
      : [
          stamp(deps, {
            type: "task.project.set",
            payload: { taskId, projectId: sorted.projectId },
          }),
        ]),
    stamp(deps, {
      type: "task.importance.set",
      payload: { taskId, importance: sorted.importance },
    }),
    ...(sorted.dueAt === null || sorted.dueTz === null
      ? []
      : [
          stamp(deps, {
            type: "task.updated",
            payload: { taskId, dueAt: sorted.dueAt, dueTz: sorted.dueTz },
          }),
        ]),
  ];
};

const discardInbox =
  (deps: ActionDeps): InboxActions["discardInbox"] =>
  async (taskId) => {
    const task = taskOf(deps, taskId);
    if (!task.ok) {
      return task;
    }
    const history = deps.state.store
      .getState()
      .events.filter((event) => "taskId" in event.payload && event.payload.taskId === taskId);
    const created = history.find((event) => event.type === "task.created");
    if (created !== undefined && history.length === 1) {
      return fromStore(await deps.state.revoke(created.id));
    }
    return await emit(deps, [
      stamp(deps, { type: "task.closed", payload: { taskId, outcome: "skipped" } }),
    ]);
  };

export const inboxActions = (deps: ActionDeps): InboxActions => ({
  acceptSuggestion: async (taskId, suggestion, overrides = {}) => {
    const task = taskOf(deps, taskId);
    return task.ok
      ? await emit(deps, sortingEvents(deps, task.value, { ...suggestion, ...overrides }))
      : task;
  },
  captureInbox: async (text, at) =>
    text.trim() === ""
      ? err("action/empty-text")
      : await emit(deps, [
          stamp(
            deps,
            {
              type: "task.created",
              payload: {
                taskId: newId(),
                title: text,
                presetId: "inbox",
                importance: "nice_to_have",
                sourceText: text,
                subtasks: [],
                fields: {},
              },
            },
            { at },
          ),
        ]),
  discardInbox: discardInbox(deps),
});
