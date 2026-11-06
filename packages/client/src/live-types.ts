import type { LiveServerMessage } from "@pace/core";

/** A sequenced server page, shared by live parsing and the connection lifecycle. */
export type LiveEventsPage = Omit<Extract<LiveServerMessage, { type: "events" }>, "id" | "type">;
