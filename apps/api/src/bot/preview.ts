import {
  CLASSIFY_CONFIDENT,
  type Language,
  newId,
  type ParseRequestBody,
  type ParseUnavailableReason,
  t,
} from "@pace/core";

import { inboxBody } from "../shared/inbox.ts";
import { parseDecision } from "../shared/llm/decision.ts";
import {
  type ModelRead,
  type Models,
  readByRules,
  type Reading,
  readMessage,
} from "../shared/llm/read.ts";
import { describeActions } from "./describe.ts";
import {
  answerIndexes,
  answerPreview,
  buttonsFor,
  domainButtons,
  PREVIEW_ACTIONS,
  questionsOf,
} from "./preview-buttons.ts";
import { logReading, tellLog } from "./preview-log.ts";
import { isRevisable, type Pending, requestOf } from "./preview-pending.ts";
import { accept, planAll } from "./preview-write.ts";
import { applyBodies, type BotReply, plain, type Turn } from "./turn.ts";

/**
How long the bot waits for the assistant: grammY answers Telegram's webhook within 10 s, and a
late answer makes Telegram send the update again (a second preview or revision).
*/
const BOT_READ_DEADLINE_MS = 7000;

/**
No model answers: the bot still lets the person inspect and approve a rule-based action, and says
why: unavailable, or (every model answered out of shape) that it could not read this one.
*/
const unavailable = async (
  turn: Turn,
  {
    text,
    retryAt,
    reason,
    domain,
    decisionIds = [],
  }: {
    readonly text: string;
    readonly retryAt: null | string;
    readonly reason: ParseUnavailableReason;
    readonly domain: "activity" | "auto" | "task";
    readonly decisionIds?: readonly string[] | undefined;
  },
): Promise<BotReply> => {
  const id = await logReading(turn, parseDecision(text, "bot", { retryAt, status: "unavailable" }));
  return await previewOf(turn, {
    decisionIds: [...decisionIds, id],
    text,
    read: readByRules(text, domain, { now: turn.now, state: turn.state }),
    unread: reason,
  });
};

/** The line over a rule-based preview: why no model read it (bug class 99). */
const rulesPrefix = (language: Language, unread: null | ParseUnavailableReason): string => {
  if (unread === null) {
    return "";
  }
  const key = unread === "unreadable" ? "bot.rulesPreviewUnreadable" : "bot.rulesPreview";
  return `${t(language, key)}\n\n`;
};

const actionText = (
  turn: Turn,
  read: Reading & { readonly questions?: ModelRead["questions"] },
): string =>
  describeActions(read.actions, {
    language: turn.state.settings.language,
    now: turn.now,
    questions: questionsOf(read),
    state: turn.state,
  });

/** The actions → the events they imply, kept until a button decides; the preview text. */
const previewOf = async (
  turn: Turn,
  {
    text,
    request = text,
    read,
    unread = null,
    thread = [],
    decisionIds,
  }: {
    readonly decisionIds: readonly string[];
    readonly text: string;
    readonly request?: string;
    readonly read: Reading & { readonly questions?: ModelRead["questions"] };
    /** Why no model read it, for a rule-based preview; `null` for the model's own. */
    readonly unread?: null | ParseUnavailableReason;
    readonly thread?: NonNullable<ParseRequestBody["thread"]>;
  },
): Promise<BotReply> => {
  const { state, store } = turn;
  const { language } = state.settings;
  const prefix = rulesPrefix(language, unread);
  const canAccept =
    read.actions.length > 0 && planAll(turn, { actions: read.actions, text: request }).ok;
  const id = newId();
  const isNeedsChoice = read.confidence < CLASSIFY_CONFIDENT;
  const questions = questionsOf(read);
  await store.remember(id, {
    actions: canAccept ? [...read.actions] : null,
    domain: read.domain,
    text,
    request,
    thread,
    awaitingChoice: isNeedsChoice,
    questions: [...questions],
    decisionIds: [...decisionIds],
  } satisfies Pending);
  if (isNeedsChoice) {
    return {
      buttons: domainButtons(id, language),
      text: prefix + t(language, read.domain === "task" ? "bot.readAsTask" : "bot.readAsActivity"),
      pendingId: id,
    };
  }
  if (!canAccept) {
    return {
      buttons: buttonsFor(id, language, { canAccept: false, canInbox: read.domain === "task" }),
      text: t(language, "bot.notUnderstood"),
      pendingId: id,
    };
  }
  return {
    buttons: buttonsFor(id, language, {
      canAccept: true,
      canInbox: read.domain === "task" && read.actions.some((item) => item.kind === "task.create"),
      questions,
    }),
    pendingId: id,
    text: prefix + actionText(turn, read),
  };
};

/** Free text → the assistant's actions, checked against the text, shown with Accept / To Inbox / Cancel. */
export const preview = async (turn: Turn, models: Models, text: string): Promise<BotReply> => {
  const { now, state } = turn;
  const read = await readMessage(models, text, {
    cooldowns: await turn.store.llmCooldowns(now),
    deadlineMs: BOT_READ_DEADLINE_MS,
    domain: "auto",
    now,
    state,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, now);
  if (!read.ok) {
    const { reason, retryAt } = read.error;
    return await unavailable(turn, { domain: "auto", reason, retryAt, text });
  }
  const { output, actions, provider, rejected } = read.value;
  const id = await logReading(
    turn,
    parseDecision(text, "bot", { output, actions, provider, rejected, status: "parsed" }),
  );
  return await previewOf(turn, { decisionIds: [id], text, read: read.value });
};

/** A revision read: logged, then shown as the preview that replaces the one it revised. */
const showRevision = async (
  turn: Turn,
  {
    read,
    text,
    thread,
    decisionIds = [],
  }: {
    readonly read: ModelRead;
    readonly text: string;
    readonly thread: NonNullable<ParseRequestBody["thread"]>;
    readonly decisionIds?: readonly string[] | undefined;
  },
): Promise<BotReply> => {
  const { output, actions, provider, rejected } = read;
  const id = await logReading(
    turn,
    parseDecision(text, "bot", {
      output,
      actions,
      provider,
      rejected,
      status: "parsed",
      thread: thread.map((turn) => turn.text),
    }),
  );
  return await previewOf(turn, {
    decisionIds: [...decisionIds, id],
    text,
    // The thread's first message is the request, in previews remembered before `request` too.
    request: thread[0]?.text ?? text,
    read,
    thread,
  });
};

/** A new chat message revises a still pending answer, with its entire earlier thread. */
export const followupPreview = async (
  turn: Turn,
  models: Models,
  { id, text }: { readonly id: string; readonly text: string },
): Promise<BotReply | null> => {
  const pending = (await turn.store.peek(id)) as Partial<Pending> | undefined;
  if (!isRevisable(pending)) {
    return null;
  }
  const thread = [...(pending.thread ?? []), { text: pending.text, actions: [...pending.actions] }];
  if (thread.length > 5) {
    return plain(t(turn.state.settings.language, "bot.tooManyCorrections"));
  }
  const read = await readMessage(models, text, {
    cooldowns: await turn.store.llmCooldowns(turn.now),
    deadlineMs: BOT_READ_DEADLINE_MS,
    domain: pending.domain,
    now: turn.now,
    state: turn.state,
    thread,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, turn.now);
  if (!read.ok) {
    const isUnreadable = read.error.reason === "unreadable";
    const key = isUnreadable ? "bot.correctionUnreadable" : "bot.correctionUnavailable";
    return plain(t(turn.state.settings.language, key));
  }
  // Taken now, after the read: an Approve or another answer pressed meanwhile already took it.
  return (await turn.store.recall(id)) === undefined
    ? plain(t(turn.state.settings.language, "bot.expired"))
    : await showRevision(turn, {
        decisionIds: pending.decisionIds,
        read: read.value,
        text,
        thread,
      });
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
const chooseDomain = async (
  turn: Turn,
  models: Models,
  { pending, domain }: { readonly pending: Pending; readonly domain: "activity" | "task" },
): Promise<BotReply> => {
  const read = await readMessage(models, pending.text, {
    cooldowns: await turn.store.llmCooldowns(turn.now),
    deadlineMs: BOT_READ_DEADLINE_MS,
    domain,
    now: turn.now,
    state: turn.state,
  });
  await turn.store.noteLlmLimits(read.ok ? read.value.limited : read.error.limited, turn.now);
  return read.ok
    ? await previewOf(turn, {
        decisionIds: pending.decisionIds ?? [],
        text: pending.text,
        request: requestOf(pending),
        read: read.value,
        thread: pending.thread,
      })
    : await unavailable(turn, {
        decisionIds: pending.decisionIds,
        domain,
        reason: read.error.reason,
        retryAt: read.error.retryAt,
        text: pending.text,
      });
};

const finishPreview = async (turn: Turn, pending: Pending, action: string): Promise<BotReply> => {
  const { language } = turn.state.settings;
  if (action === PREVIEW_ACTIONS.inbox && pending.domain === "task") {
    const failure = await applyBodies(turn, [inboxBody(requestOf(pending))]);
    if (failure === null) {
      await tellLog(turn, pending, { resolution: "inbox" });
    }
    return plain(failure ?? t(language, "bot.savedToInbox"));
  }
  if (action !== PREVIEW_ACTIONS.accept || pending.actions === null || pending.awaitingChoice) {
    return plain(t(language, "bot.expired"));
  }
  const { failure, taskId } = await accept(turn, {
    actions: pending.actions,
    text: requestOf(pending),
  });
  if (failure === null) {
    await tellLog(turn, pending, { resolution: "approved", taskId });
  }
  return plain(failure ?? t(language, "bot.done"));
};

/** A preview button: write what was understood, keep the text in the Inbox, or drop it. */
export const choosePreview = async (
  turn: Turn,
  models: Models,
  { action, id }: { readonly action: string; readonly id: string },
): Promise<BotReply> => {
  const { language } = turn.state.settings;
  const at = answerIndexes(action);
  if (at !== undefined) {
    const revise = async (text: string) => await followupPreview(turn, models, { id, text });
    return await answerPreview(turn, { at, id }, revise);
  }
  const pending = (await turn.store.recall(id)) as Partial<Pending> | undefined;
  // A preview kept before this shape (or none at all) cannot be written any more.
  if (pending?.text === undefined || pending.actions === undefined) {
    return plain(t(language, "bot.expired"));
  }
  if (action === PREVIEW_ACTIONS.cancel) {
    await tellLog(turn, pending, { resolution: "cancelled" });
    return plain(t(language, "bot.cancelled"));
  }
  if (action === PREVIEW_ACTIONS.task || action === PREVIEW_ACTIONS.activity) {
    const domain = action === PREVIEW_ACTIONS.task ? "task" : "activity";
    return await chooseDomain(turn, models, { pending: pending as Pending, domain });
  }
  return await finishPreview(turn, pending as Pending, action);
};
