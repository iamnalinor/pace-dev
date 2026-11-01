import { isOwnSignIn, minutesBetween, type PoolNotification } from "@pace/core";

/**
A list fetched this long after a notice is taken to know its session: the device's clock may run
ahead of the server's by less than this.
*/
const LIST_AFTER_NOTICE_MINUTES = 2;

/** The sessions as the feed last fetched them. */
export type ListedSessions = {
  /** The session reading the feed. */
  readonly current: string | undefined;
  readonly ids: ReadonlySet<string>;
  /** When that list was asked for (this device's clock); null until one arrived. */
  readonly loadedAt: null | string;
};

/**
What a notice is to the feed: a sign-in about the session reading it (`own`, never answered here,
said as "this device"), one whose session already ended elsewhere (`ended`: no Not me left to
offer, QA round 15 L11), or open. A list that may predate the notice says nothing about it.
*/
export const signInState = (
  notification: PoolNotification,
  listed: ListedSessions,
): "ended" | "open" | "own" => {
  if (notification.kind !== "login") {
    return "open";
  }
  if (isOwnSignIn(notification, listed.current)) {
    return "own";
  }
  const isKnowsIt =
    listed.loadedAt !== null &&
    minutesBetween(notification.createdAt, listed.loadedAt) > LIST_AFTER_NOTICE_MINUTES;
  return isKnowsIt && !listed.ids.has(notification.payload.sessionId) ? "ended" : "open";
};
