import {
  accountTz,
  actionsByRules,
  canReadLater,
  type DecisionResolution,
  domainByRules,
  endpoints,
  type ParseRequestBody,
  type ParseResponse,
  type ParseUnavailableReason,
  resolutionsOf,
  RULES_CONFIDENCE,
  withSummary,
} from "@pace/core";

import type { ActivityReading } from "./actions/time-actions.ts";
import type { ApiClient } from "./api-client.ts";
import type { Clock } from "./clock.ts";
import type { AppStateHandle } from "./state.ts";

import { type AiReading, aiReading } from "./view-models/ai-reading.ts";

/** Why no model read a text, and whether the server can keep it for one that can later. */
export type Unread = {
  readonly reason: ParseUnavailableReason;
  /** "Read it when it's back" would be kept, not asked again to the same end (bug class 99). */
  readonly canReadLater: boolean;
};

/**
The `unavailable` answer's reason, as one rule for every screen that shows it. A server older than
`reason` (or one naming a reason this client does not know) kept a text for later only with a
time to wait for: its reason is read from that time.
*/
export const unreadOf = (answer: {
  readonly reason: null | ParseUnavailableReason;
  readonly retryAt: null | string;
}): Unread =>
  answer.reason === null
    ? {
        canReadLater: answer.retryAt !== null,
        reason: answer.retryAt === null ? "unreachable" : "limited",
      }
    : { canReadLater: canReadLater(answer.reason), reason: answer.reason };

/** What asking the assistant to read a line came to. */
export type AiOutcome =
  | (Unread & { readonly status: "unavailable"; readonly retryAt: null | string })
  | { readonly status: "failed" }
  | { readonly status: "queued"; readonly retryAt: null | string }
  | { readonly status: "read"; readonly reading: AiReading };

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
    // Our own server could not be reached, which is not about its models.
    reason: null,
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
      if (answer.status === "parsed") {
        return { reading: aiReading(answer), status: "read" };
      }
      return answer.status === "queued"
        ? { retryAt: answer.retryAt, status: "queued" }
        : { ...unreadOf(answer), retryAt: answer.retryAt, status: "unavailable" };
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
      return answer.status === "parsed" && start?.kind === "activity.start"
        ? {
            category: start.category,
            expectMinutes: start.expectMinutes ?? null,
            label: start.label,
          }
        : null;
    } catch {
      return null;
    }
  },
});
