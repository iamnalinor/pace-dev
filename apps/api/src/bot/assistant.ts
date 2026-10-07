import {
  type CoreState,
  type EventBody,
  type EventInput,
  type Language,
  newId,
  nowList,
  openInstanceOf,
  planParse,
  quickInputBodies,
  t,
  verifyParse,
} from "@pace/core";

import type { BotStoreApi } from "../shared/contract.ts";

import { type ParseProvider, runParse  } from "../parse/llm.ts";
import { buildParsePrompt } from "../parse/prompt.ts";
import { describePlan } from "./describe.ts";

export type BotButton = { readonly label: string; readonly data: string };

export type BotReply = {
  readonly text: string;
  readonly buttons: readonly (readonly BotButton[])[];
};

export type AssistantDeps = {
  /** The Pace user behind a Telegram account, if they ever logged in through the bot. */
  readonly userIdOf: (telegramId: string) => Promise<null | string>;
  readonly storeOf: (userId: string) => BotStoreApi;
  readonly providers: readonly ParseProvider[];
  readonly now: () => string;
};

export type Assistant = {
  readonly now: (telegramId: string) => Promise<BotReply>;
  readonly message: (telegramId: string, text: string) => Promise<BotReply>;
  readonly choose: (telegramId: string, data: string) => Promise<BotReply>;
};

/** A preview waiting for its button: the text and, when it was understood, what to write. */
type Pending = { readonly text: string; readonly bodies: null | readonly EventBody[] };

const BOT_DEVICE = "bot";
const NOW_ROWS = 5;

const plain = (text: string): BotReply => ({ buttons: [], text });

const stampAll = (bodies: readonly EventBody[], now: string): readonly EventInput[] =>
  bodies.map(
    (body) => ({ ...body, occurredAt: now, precision: "exact", source: "bot" }),
  );

const inboxBody = (text: string): EventBody => ({
  payload: {
    fields: {},
    importance: "nice_to_have",
    presetId: "inbox",
    sourceText: text,
    subtasks: [],
    taskId: newId(),
    title: text,
  },
  type: "task.created",
});

const buttonsFor = (id: string, language: Language, canAccept: boolean): BotReply["buttons"] => [
  [
    ...(canAccept ? [{ data: `a:${id}`, label: t(language, "bot.accept") }] : []),
    { data: `i:${id}`, label: t(language, "bot.toInbox") },
    { data: `c:${id}`, label: t(language, "bot.cancel") },
  ],
];

const timeOf = (iso: string, state: CoreState): string =>
  new Intl.DateTimeFormat(state.settings.language, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: state.settings.timezone ?? "UTC",
  }).format(new Date(iso));

/** The bot's conversation: free text → a preview with buttons; a button writes it. */
export const createAssistant = (deps: AssistantDeps): Assistant => {
  const withUser = async (
    telegramId: string,
    run: (store: BotStoreApi, state: CoreState) => Promise<BotReply>,
  ): Promise<BotReply> => {
    const userId = await deps.userIdOf(telegramId);
    if (userId === null) {
      return plain(t("en", "bot.notLinked"));
    }
    const store = deps.storeOf(userId);
    const { state } = await store.read(deps.now());
    return await run(store, state);
  };

  const apply = async (
    store: BotStoreApi,
    bodies: readonly EventBody[],
    language: Language,
  ): Promise<null | string> => {
    const now = deps.now();
    const result = await store.apply(stampAll(bodies, now), {
      deviceId: BOT_DEVICE,
      now,
      source: "bot",
    });
    return result.ok ? null : t(language, "bot.failed", { reason: result.error.code });
  };

  const preview = async (store: BotStoreApi, state: CoreState, text: string): Promise<BotReply> => {
    const now = deps.now();
    const { language } = state.settings;
    const ctx = { deviceTz: state.settings.timezone ?? "UTC", now };
    const answer = await runParse(deps.providers, buildParsePrompt(text, { ctx, language, state }));
    if (!answer.ok) {
      const failure = await apply(store, [inboxBody(text)], language);
      const { retryAt } = answer.error;
      return plain(
        failure ??
          (retryAt === null
            ? t(language, "bot.unavailableSoon")
            : t(language, "bot.unavailable", { time: timeOf(retryAt, state) })),
      );
    }
    const projectNames = Object.values(state.projects.byId).map((project) => project.name);
    const verified = verifyParse(answer.value.result, { projectNames, source: text });
    const plan = planParse(verified, text, { ctx, state });
    const id = newId();
    if (!plan.ok) {
      await store.remember(id, { bodies: null, text } satisfies Pending);
      return { buttons: buttonsFor(id, language, false), text: t(language, "bot.notUnderstood") };
    }
    const bodies =
      plan.value.kind === "update"
        ? plan.value.bodies
        : quickInputBodies(plan.value.input, { now, state }, newId);
    await store.remember(id, { bodies, text } satisfies Pending);
    const instance =
      plan.value.kind === "create"
        ? openInstanceOf(state, plan.value.input.presetId, now)
        : undefined;
    return {
      buttons: buttonsFor(id, language, true),
      text: describePlan(plan.value, {
        doubtful: verified.doubtful,
        instanceTitle: instance?.title ?? null,
        language,
        questions: verified.result.questions.map((question) => question.question),
        state,
      }),
    };
  };

  return {
    choose: async (telegramId, data) =>
      await withUser(telegramId, async (store, state) => {
        const { language } = state.settings;
        const [action = "", id = ""] = data.split(":", 2);
        const pending = (await store.recall(id)) as Pending | undefined;
        if (pending === undefined) {
          return plain(t(language, "bot.expired"));
        }
        if (action === "c") {
          return plain(t(language, "bot.cancelled"));
        }
        const isAccept = action === "a" && pending.bodies !== null;
        const failure = await apply(
          store,
          isAccept ? (pending.bodies ?? []) : [inboxBody(pending.text)],
          language,
        );
        return plain(failure ?? t(language, isAccept ? "bot.done" : "bot.savedToInbox"));
      }),
    message: async (telegramId, text) =>
      await withUser(telegramId, async (store, state) => await preview(store, state, text)),
    now: async (telegramId) =>
      await withUser(telegramId, async (_store, state) => {
        const { language, timezone } = state.settings;
        const list = nowList(state, { deviceTz: timezone ?? "UTC", now: deps.now() });
        const titles = list.items
          .slice(0, NOW_ROWS)
          .map((item, index) => `${String(index + 1)}. ${item.task.title}`);
        return plain(
          titles.length === 0
            ? t(language, "bot.nowEmpty")
            : [t(language, "bot.nowTitle"), ...titles].join("\n"),
        );
      }),
  };
};
