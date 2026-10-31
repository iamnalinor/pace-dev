import {
  accountTz,
  actionsByRules,
  type DecisionResolution,
  domainByRules,
  endpoints,
  type ParseRequestBody,
  type ParseResponse,
  resolutionsOf,
  RULES_CONFIDENCE,
  withSummary,
} from "@pace/core";

import type { ActivityReading } from "./actions/time-actions.ts";
import type { ApiClient } from "./api-client.ts";
import type { Clock } from "./clock.ts";
import type { AppStateHandle } from "./state.ts";

import { type AiReading, aiReading } from "./view-models/ai-reading.ts";

/** What asking the assistant to read a line came to. */
export type AiOutcome =
  | { readonly status: "failed" }
  | { readonly status: "queued"; readonly retryAt: null | string }
  | { readonly status: "read"; readonly reading: AiReading }
  | { readonly status: "unavailable"; readonly retryAt: null | string };

export type Assistant = {
  /** Reads a task or activity request into pending actions without writing them. */
  readonly propose: (
    text: string,
    domain: ParseRequestBody["domain"],
    thread?: ParseRequestBody["thread"],
  ) => Promise<null | ParseResponse>;
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
  /**
  Tells the assistant log what became of a conversation's readings (`decisionIds`, the last
  the one acted on): approved (with the task it created), dismissed, or kept in the Inbox.
  Best effort: an answer lost offline leaves the rows undecided, and the log says less.
  */
  readonly resolve: (
    decisionIds: readonly string[],
    resolution: DecisionResolution,
    taskId?: null | string,
  ) => Promise<void>;
};

type AssistantDeps = {
  readonly api: ApiClient;
  readonly clock: Clock;
  readonly state: AppStateHandle;
};

/** When transport fails, use the same local rules and public answer shape as the Worker. */
const localReading = (
  deps: AssistantDeps,
  text: string,
  domain: ParseRequestBody["domain"],
): ParseResponse => {
  const state = deps.state.store.getState();
  const now = deps.clock.now();
  const ctx = { deviceTz: deps.clock.deviceTz, now };
  const read = domain === "auto" ? domainByRules(text, { ctx, state }) : domain;
  const world = { language: state.settings.language, now, state, zone: accountTz(state, ctx) };
  return {
    actions: actionsByRules(text, read, { ctx, state }).map((body) => withSummary(body, [], world)),
    confidence: domain === "auto" ? RULES_CONFIDENCE : 1,
    domain: read,
    retryAt: null,
    status: "unavailable",
  };
};

export const createAssistant = (deps: AssistantDeps): Assistant => ({
  propose: async (text, domain, thread) => {
    try {
      return await deps.api.call(endpoints.parse.run, {
        body: { text, domain, ...(thread !== undefined && { thread }) },
      });
    } catch {
      return thread !== undefined && thread.length > 0 ? null : localReading(deps, text, domain);
    }
  },
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
  resolve: async (decisionIds, resolution, taskId = null) => {
    const answers = resolutionsOf(decisionIds, resolution, taskId);
    if (answers.length === 0) {
      return;
    }
    try {
      await deps.api.call(endpoints.decisions.resolve, { body: { decisions: [...answers] } });
    } catch {
      // The log is a record for the person, not a step of the action: nothing to undo.
    }
  },
  readActivity: async (text) => {
    try {
      const answer = await deps.api.call(endpoints.parse.run, {
        body: { domain: "activity", text },
      });
      const start = answer.actions.find((action) => action.kind === "activity.start");
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
