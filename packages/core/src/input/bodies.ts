import type { EventInput } from "../events/event-schema.ts";

/** An event without its envelope: what to write, before a writer stamps time, device and source. */
export type EventBody = EventInput extends infer I
  ? I extends { readonly type: unknown; readonly payload: unknown }
    ? Pick<I, "payload" | "type">
    : never
  : never;

type NewSubtask = { readonly label: string; readonly number: null | number };

/** `task.subtasks.added` for the given labels, or nothing when there are none. */
export const subtasksAddedBodies = (
  taskId: string,
  subtasks: readonly NewSubtask[],
  idOf: (index: number) => string,
): readonly EventBody[] =>
  subtasks.length === 0
    ? []
    : [
        {
          type: "task.subtasks.added",
          payload: {
            taskId,
            subtasks: subtasks.map((subtask, index) => ({
              id: idOf(index),
              label: subtask.label,
              ...(subtask.number !== null && { number: subtask.number }),
            })),
          },
        },
      ];
