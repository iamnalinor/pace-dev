/*
One real read through every configured LLM provider, each on its own (bug class 40: after a
change to a provider, its config or the schema, run the real endpoints before the release).
Reads LLM_BASE_URL_N / LLM_API_KEY_N / LLM_MODEL_N from the environment; prints one line per
provider and fails when none answers. `bun run --cwd apps/api llm:smoke`.
*/
import { actionContext } from "@pace/core";
import { artboardState, ctx } from "@pace/core/testing";

import { loadConfig } from "../src/shared/config.ts";
import { runParse } from "../src/shared/llm/llm.ts";
import { buildParsePrompt } from "../src/shared/llm/prompt.ts";
import { parseProviders } from "../src/shared/llm/providers.ts";

const config = loadConfig({
  ALLOWED_TELEGRAM_IDS: "",
  ENVIRONMENT: "development",
  TELEGRAM_BOT_USERNAME: "smoke",
  WEB_ORIGIN: "https://smoke.invalid",
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("LLM_"))),
});
if (!config.ok) {
  console.error(config.error);
  process.exit(1);
}
for (const reason of config.value.llmSkipped) {
  console.error(`skipped ${reason}`);
}
const providers = parseProviders(config.value);
if (providers.length === 0) {
  console.error("No LLM_*_N configured");
  process.exit(1);
}
const state = artboardState();
const prompt = buildParsePrompt("дз 7 по алгебре 1, 3, 5а до среды 23:59", {
  context: actionContext(state, ctx()),
  ctx: ctx(),
  domain: "auto",
  language: "ru",
  state,
});
let answered = 0;
for (const provider of providers) {
  const started = Date.now();
  const result = await runParse([provider], prompt);
  const ms = Date.now() - started;
  if (result.ok) {
    answered += 1;
    const kinds = result.value.result.actions.map((action) => action.kind).join(", ");
    console.log(`ok    ${provider.name}  ${String(ms)} ms  ${kinds}`);
  } else {
    console.log(`fail  ${provider.name}  ${String(ms)} ms  ${result.error.code}`);
  }
}
process.exit(answered > 0 ? 0 : 1);
