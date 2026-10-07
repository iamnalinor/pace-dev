import { endpoints } from "@pace/core";

import type { ApiClient } from "./api-client.ts";
import type { AppStateHandle } from "./state.ts";

import { type Clock, queryContext } from "./clock.ts";
import { type AiReading, aiReading } from "./view-models/ai-reading.ts";

/** What asking the assistant to read a line came to. */
export type AiOutcome =
  | { readonly status: "failed" }
  | { readonly status: "read"; readonly reading: AiReading }
  | { readonly status: "unavailable"; readonly retryAt: null | string };

export type Assistant = {
  /** Sends the line to `POST /api/parse` and turns the answer into composer edits; writes nothing. */
  readonly read: (text: string) => Promise<AiOutcome>;
};

export const createAssistant = (deps: {
  readonly api: ApiClient;
  readonly state: AppStateHandle;
  readonly clock: Clock;
}): Assistant => ({
  read: async (text) => {
    try {
      const answer = await deps.api.call(endpoints.parse.run, { body: { text } });
      if (answer.status === "unavailable") {
        return { retryAt: answer.retryAt, status: "unavailable" };
      }
      const reading = aiReading(text, answer, {
        ctx: queryContext(deps.clock),
        state: deps.state.store.getState(),
      });
      return { reading, status: "read" };
    } catch {
      return { status: "failed" };
    }
  },
});
