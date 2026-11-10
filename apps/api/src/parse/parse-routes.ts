import type { Context, Hono } from "hono";

import {
  canReadLater,
  type CoreState,
  endpoints,
  newId,
  ok,
  type ParseRequestBody,
  type ParseResponse,
  type ParseUnavailableReason,
} from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Config } from "../shared/config.ts";

import { requireUser } from "../shared/current-user.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import { llmHealthAfterResponse } from "../shared/llm/health-store.ts";
import { availability, type ParseProvider } from "../shared/llm/llm.ts";
import { readByRules, readMessage } from "../shared/llm/read.ts";
import { mount } from "../shared/mount.ts";

/** How long the app's read may take in all, however many providers are tried. */
const APP_READ_DEADLINE_MS = 20_000;

/**
`POST /api/parse`: the user's state (categories, projects, open tasks, recent activities)
frames the prompt; the answer comes back as actions checked against the text. Nothing is
written, unless no model can answer and the caller asked to `defer`: then the text waits in
the store and is read (and written) once one is back. Without a model the rules propose what
they can. `GET /api/llm/status`: can the assistant read now?
*/
const storeOf = (c: Context<AppEnv>) => c.env.USER_STORE.of(requireUser(c).id);

/**
No model can answer: logged, the rules' reading, and why. Kept for later when the caller asked to
defer and a model may read it then (`canReadLater`: resting, or down with no time said, read at
the queue's next try); never when every model answered out of shape or none is configured, which
waiting would not change (bug class 99).
*/
const unavailable = async (
  store: ReturnType<typeof storeOf>,
  request: ParseRequestBody,
  world: {
    readonly state: CoreState;
    readonly now: string;
    readonly retryAt: null | string;
    readonly reason: ParseUnavailableReason;
  },
): Promise<ParseResponse> => {
  const { now, reason, retryAt } = world;
  const decisionId = newId();
  await store.logDecisions(
    [{ ...parseDecision(request.text, "api", { retryAt, status: "unavailable" }), id: decisionId }],
    now,
  );
  const rules = readByRules(request.text, request.domain, world);
  if (!canReadLater(reason) || request.defer !== true) {
    // The rules' reading can still be approved or dismissed: the answer names its decision.
    const actions = [...rules.actions];
    return { ...rules, actions, decisionId, reason, retryAt, status: "unavailable" };
  }
  await store.enqueueParse(
    { channel: "api", domain: request.domain, retryAt, text: request.text },
    now,
  );
  return { ...rules, actions: [], retryAt, status: "queued" };
};

/** The answer with `proposals` beside `actions`, for apps installed before the rename. */
const withLegacyName = (answer: ParseResponse): ParseResponse => ({
  ...answer,
  proposals: answer.actions,
});

export const mountParseRoutes = (
  app: Hono<AppEnv>,
  providersOf: (config: Config) => readonly ParseProvider[],
): void => {
  mount(app, endpoints.parse.run, async ({ body, c }) => {
    const now = new Date().toISOString();
    const store = storeOf(c);
    const { state } = await store.read(now);
    const models = {
      health: llmHealthAfterResponse(c.env, c.executionCtx),
      providers: providersOf(c.get("config")),
    };
    const read = await readMessage(models, body.text, {
      cooldowns: await store.llmCooldowns(now),
      // A person waits on a spinner: past this the rules answer instead.
      deadlineMs: APP_READ_DEADLINE_MS,
      domain: body.domain,
      now,
      state,
      thread: body.thread,
    });
    await store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, now);
    if (!read.ok) {
      return ok(withLegacyName(await unavailable(store, body, { ...read.error, now, state })));
    }
    const { confidence, domain, output, actions, provider, questions, rejected } = read.value;
    // Readings while typing come every pause: only the ones the person acts on are logged.
    const decisionId = body.draft === true ? undefined : newId();
    if (decisionId !== undefined) {
      const thread = body.thread?.map((turn) => turn.text);
      const entry = parseDecision(body.text, "api", {
        output,
        actions,
        provider,
        rejected,
        status: "parsed",
        thread,
      });
      await store.logDecisions([{ ...entry, id: decisionId }], now);
    }
    return ok(
      withLegacyName({
        confidence,
        domain,
        actions: [...actions],
        ...(decisionId !== undefined && { decisionId }),
        provider,
        ...(questions.length > 0 && { questions: [...questions] }),
        status: "parsed" as const,
      }),
    );
  });

  mount(app, endpoints.parse.status, async ({ c }) => {
    const now = new Date().toISOString();
    const store = storeOf(c);
    const names = providersOf(c.get("config")).map((provider) => provider.name);
    return ok(availability(names, await store.llmCooldowns(now), now));
  });
};
