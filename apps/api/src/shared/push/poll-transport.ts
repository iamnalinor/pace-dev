import type { PushTransport } from "./transport.ts";

/** One entry waiting for a polling device: a notification to show, or one to take back. */
export type PollEntry =
  | { readonly type: "dismiss"; readonly notificationId: string }
  | {
      readonly type: "show";
      readonly notificationId: string;
      readonly title: string;
      readonly body: string;
    };

/** Where entries wait for a device (the user's store keeps them). */
export type PollQueue = {
  readonly enqueue: (sessionId: string, entry: PollEntry) => Promise<void>;
};

/**
Polling: the phone's periodic background check (and the open app, at once on a live notice)
fetches what waits for it and shows or takes back each, under the pool id. Sending only queues.
*/
export const pollTransport = (queue: PollQueue): PushTransport => ({
  dismiss: async (to, notificationId) => {
    await queue.enqueue(to.sessionId, { notificationId, type: "dismiss" });
  },
  // Nothing to be refused: the queue is Pace's own.
  fingerprint: "poll",
  method: "poll",
  send: async (to, { body, notification, title }) => {
    await queue.enqueue(to.sessionId, {
      body,
      notificationId: notification.id,
      title,
      type: "show",
    });
    return "queued";
  },
});
