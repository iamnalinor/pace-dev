import type { Event } from "@pace/core";

export type DeletePlan =
  | { readonly kind: "cancel" }
  | { readonly kind: "revoke"; readonly eventId: string };

/**
"Delete" never erases history: a task nothing happened to yet is taken back by revoking
its creation; one with a past (solved problems, a rank, a status) is closed as cancelled.
*/
export const deletePlan = (events: readonly Event[], taskId: string): DeletePlan => {
  const own = events.filter(
    (event) => "taskId" in event.payload && event.payload.taskId === taskId,
  );
  const [only] = own;
  return own.length === 1 && only?.type === "task.created"
    ? { eventId: only.id, kind: "revoke" }
    : { kind: "cancel" };
};
