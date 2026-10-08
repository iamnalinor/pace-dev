import type { Context, Hono } from "hono";

import { endpoints, ok, type ParseResponse, verifyParse } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Config } from "../shared/config.ts";

import { requireUser } from "../shared/current-user.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import { availability, type ParseProvider, runParse } from "../shared/llm/llm.ts";
import { buildParsePrompt } from "../shared/llm/prompt.ts";
import { mount } from "../shared/mount.ts";

/**
`POST /api/parse`: the user's state (categories, projects, open tasks) frames the prompt;
the answer is checked against the text before it goes back. Nothing is written, unless no
model can answer and the caller asked to `defer`: then the text waits in the store and is
read (and written) once one is back. `GET /api/llm/status`: can the assistant read now?
*/
const storeOf = (c: Context<AppEnv>) =>
  c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));

/** No model can answer: logged, and kept for later when the caller asked to defer. */
const unavailable = async (
  store: ReturnType<typeof storeOf>,
  { defer, text }: { readonly text: string; readonly defer?: boolean | undefined },
  { now, retryAt }: { readonly now: string; readonly retryAt: null | string },
): Promise<ParseResponse> => {
  await store.logDecisions([parseDecision(text, "api", { retryAt, status: "unavailable" })], now);
  if (defer !== true) {
    return { retryAt, status: "unavailable" };
  }
  await store.enqueueParse({ channel: "api", retryAt, text }, now);
  return { retryAt, status: "queued" };
};

export const mountParseRoutes = (
  app: Hono<AppEnv>,
  providersOf: (config: Config) => readonly ParseProvider[],
): void => {
  mount(app, endpoints.parse.run, async ({ body, c }) => {
    const now = new Date().toISOString();
    const store = storeOf(c);
    const { state } = await store.read(now);
    const ctx = { deviceTz: state.settings.timezone ?? "UTC", now };
    const prompt = buildParsePrompt(body.text, { ctx, language: state.settings.language, state });
    const answer = await runParse(providersOf(c.get("config")), prompt, {
      cooldowns: await store.llmCooldowns(now),
    });
    await store.noteLlmLimits(answer.ok ? answer.value.limited : answer.error.limited, now);
    if (!answer.ok) {
      return ok(await unavailable(store, body, { now, retryAt: answer.error.retryAt }));
    }
    const projectNames = Object.values(state.projects.byId).map((project) => project.name);
    const verified = verifyParse(answer.value.result, { projectNames, source: body.text });
    // Readings while typing come every pause: only the ones the person acts on are logged.
    if (body.draft !== true) {
      await store.logDecisions(
        [
          parseDecision(body.text, "api", {
            doubtful: verified.doubtful,
            provider: answer.value.provider,
            result: verified.result,
            status: "parsed",
          }),
        ],
        now,
      );
    }
    return ok({
      doubtful: [...verified.doubtful],
      isClean: verified.isClean,
      provider: answer.value.provider,
      result: verified.result,
      status: "parsed" as const,
    });
  });

  mount(app, endpoints.parse.status, async ({ c }) => {
    const now = new Date().toISOString();
    const store = storeOf(c);
    const names = providersOf(c.get("config")).map((provider) => provider.name);
    return ok(availability(names, await store.llmCooldowns(now), now));
  });
};
