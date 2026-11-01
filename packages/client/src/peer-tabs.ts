import { type Event, parseEvent } from "@pace/core";

/**
What one tab tells the other tabs of the same browser profile about the local copy they share
(one IndexedDB, one device id): events it wrote or pulled into it, or that it dropped the copy
and read it again (a log out, a reset store).
*/
export type StoreChange =
  | { readonly events: readonly Event[]; readonly kind: "events" }
  | { readonly kind: "reload" };

/**
The line between those tabs (a BroadcastChannel on the web; none in the app, one process). The
server tells no socket of the device that wrote (one writer per device id), and a tab's pull finds
nothing once another tab moved the shared cursor, so this is the only way a second tab learns of
the first one's writes (QA round 17 M1).
*/
export type PeerTabs = {
  readonly post: (change: StoreChange) => void;
  readonly listen: (onMessage: (message: unknown) => void) => () => void;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

/** A message from another tab as a change, with its valid events only; `null` for anything else. */
export const parseStoreChange = (message: unknown): null | StoreChange => {
  if (!isRecord(message)) {
    return null;
  }
  if (message["kind"] === "reload") {
    return { kind: "reload" };
  }
  const events = message["events"];
  if (message["kind"] !== "events" || !Array.isArray(events)) {
    return null;
  }
  return {
    events: events.flatMap((item: unknown) => {
      const parsed = parseEvent(item);
      return parsed.ok ? [parsed.value] : [];
    }),
    kind: "events",
  };
};
