import type { Hono } from "hono";

import { endpoints, ok, verifyParse } from "@pace/core";

import type { AppEnv } from "../shared/app-env.ts";
import type { Config } from "../shared/config.ts";

import { requireUser } from "../shared/current-user.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import { type ParseProvider, runParse } from "../shared/llm/llm.ts";
import { buildParsePrompt } from "../shared/llm/prompt.ts";
import { mount } from "../shared/mount.ts";

/**
`POST /api/parse`: the user's state (categories, projects, open tasks) frames the prompt;
the answer is checked against the text before it goes back. Nothing is written.
*/
export const mountParseRoutes = (
  app: Hono<AppEnv>,
  providersOf: (config: Config) => readonly ParseProvider[],
): void => {
  mount(app, endpoints.parse.run, async ({ body, c }) => {
    const now = new Date().toISOString();
    const store = c.env.USER_STORE.get(c.env.USER_STORE.idFromName(requireUser(c).id));
    const { state } = await store.read(now);
    const ctx = { deviceTz: state.settings.timezone ?? "UTC", now };
    const prompt = buildParsePrompt(body.text, { ctx, language: state.settings.language, state });
    const answer = await runParse(providersOf(c.get("config")), prompt);
    if (!answer.ok) {
      const { retryAt } = answer.error;
      await store.logDecisions(
        [parseDecision(body.text, "api", { retryAt, status: "unavailable" })],
        now,
      );
      return ok({ retryAt, status: "unavailable" as const });
    }
    const projectNames = Object.values(state.projects.byId).map((project) => project.name);
    const verified = verifyParse(answer.value.result, { projectNames, source: body.text });
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
    return ok({
      doubtful: [...verified.doubtful],
      isClean: verified.isClean,
      provider: answer.value.provider,
      result: verified.result,
      status: "parsed" as const,
    });
  });
};
