import { endpoints } from "@pace/core";

import type { ActivityReading } from "./actions/time-actions.ts";
import type { ApiClient } from "./api-client.ts";

import { type AiReading, aiReading } from "./view-models/ai-reading.ts";

/** What asking the assistant to read a line came to. */
export type AiOutcome =
  | { readonly status: "failed" }
  | { readonly status: "queued"; readonly retryAt: null | string }
  | { readonly status: "read"; readonly reading: AiReading }
  | { readonly status: "unavailable"; readonly retryAt: null | string };

export type Assistant = {
  /**
  Sends the task line to `POST /api/parse` and turns the answer into composer edits; writes
  nothing. With `defer`, a line the assistant cannot read now is kept on the server and
  written once it can (`queued`).
  */
  readonly read: (
    text: string,
    options?: { readonly defer?: boolean; readonly draft?: boolean },
  ) => Promise<AiOutcome>;
  /**
  Reads a note of what the person is doing (`POST /api/parse` from the activity field) into a
  label, a category and a length; `null` when no model answers or it proposes something else
  than starting it (the activity keeps its words).
  */
  readonly readActivity: (text: string) => Promise<ActivityReading | null>;
};

export const createAssistant = (deps: { readonly api: ApiClient }): Assistant => ({
  read: async (text, options = {}) => {
    try {
      const answer = await deps.api.call(endpoints.parse.run, {
        body: {
          domain: "task",
          text,
          ...(options.defer === true && { defer: true }),
          ...(options.draft === true && { draft: true }),
        },
      });
      return answer.status === "parsed"
        ? { reading: aiReading(answer), status: "read" }
        : { retryAt: answer.retryAt, status: answer.status };
    } catch {
      return { status: "failed" };
    }
  },
  readActivity: async (text) => {
    try {
      const answer = await deps.api.call(endpoints.parse.run, {
        body: { domain: "activity", text },
      });
      const start = answer.proposals.find((proposal) => proposal.kind === "activity.start");
      return answer.status !== "parsed" || start?.kind !== "activity.start"
        ? null
        : {
            category: start.category,
            expectMinutes: start.expectMinutes ?? null,
            label: start.label,
          };
    } catch {
      return null;
    }
  },
});
