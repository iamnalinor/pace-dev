import {
  addMinutesIso,
  type CoreState,
  type EventBody,
  type EventInput,
  newId,
  planProposals,
  type Proposal,
  type ProposalKind,
  type RequestDomain,
  type Result,
  t,
} from "@pace/core";

import type { DecisionEntry } from "../shared/contract.ts";
import type { Cooldowns, ParseProvider } from "../shared/llm/llm.ts";

import { loadConfig } from "../shared/config.ts";
import { inboxBody } from "../shared/inbox.ts";
import { parseProviders } from "../shared/llm/providers.ts";
import { readMessage } from "../shared/llm/read.ts";
import { wasTelegramMessageSent } from "../shared/telegram-api.ts";
import { telegramOf } from "./notifier.ts";

/** A text to read once the assistant is back: kept in the store until then. */
export type QueuedParse = {
  readonly id: string;
  readonly text: string;
  readonly channel: "api" | "bot";
  /** The field it was typed into; a text kept before fields existed is a task's. */
  readonly domain?: RequestDomain | undefined;
  readonly enqueuedAt: string;
  /** Not before this instant; `null` = at the next chance. */
  readonly retryAt: null | string;
};

const QUEUE_KEY = "llm:queue";
const COOLDOWNS_KEY = "llm:cooldowns";

/** Without a hint, try again this much later. */
const RETRY_MINUTES = 5;
/** A text not read within a day goes to the Inbox, so nothing waits forever. */
const GIVE_UP_MINUTES = 24 * 60;

export const queueOf = async (storage: DurableObjectStorage): Promise<readonly QueuedParse[]> =>
  (await storage.get<readonly QueuedParse[]>(QUEUE_KEY)) ?? [];

export const saveQueue = async (
  storage: DurableObjectStorage,
  queue: readonly QueuedParse[],
): Promise<void> => {
  await (queue.length === 0 ? storage.delete(QUEUE_KEY) : storage.put(QUEUE_KEY, queue));
};

export const enqueue = async (
  storage: DurableObjectStorage,
  item: Omit<QueuedParse, "id">,
): Promise<void> => {
  await saveQueue(storage, [...(await queueOf(storage)), { ...item, id: newId() }]);
};

/** The providers still cooling down at `now`. */
export const cooldownsOf = async (
  storage: DurableObjectStorage,
  now: string,
): Promise<Cooldowns> => {
  const stored = (await storage.get<Cooldowns>(COOLDOWNS_KEY)) ?? {};
  return Object.fromEntries(Object.entries(stored).filter(([, until]) => until > now));
};

/** Remembers the rate limits a call ran into, so the next calls skip those providers. */
export const noteLimits = async (
  storage: DurableObjectStorage,
  limited: Cooldowns,
  now: string,
): Promise<void> => {
  if (Object.keys(limited).length === 0) {
    return;
  }
  await storage.put(COOLDOWNS_KEY, { ...(await cooldownsOf(storage, now)), ...limited });
};

/** When the queue wants to be looked at: its earliest item. */
export const queueDueAt = (queue: readonly QueuedParse[], now: string): null | string =>
  queue
    .map((item) => item.retryAt ?? now)
    .toSorted((a, b) => a.localeCompare(b))
    .at(0) ?? null;

/** Moves the alarm earlier when a queued text is due before it. */
export const armForQueue = async (storage: DurableObjectStorage, now: string): Promise<void> => {
  const due = queueDueAt(await queueOf(storage), now);
  if (due === null) {
    return;
  }
  const at = Math.max(Date.parse(due), Date.parse(now) + 1000);
  const existing = await storage.getAlarm();
  if (existing === null || at < existing) {
    await storage.setAlarm(at);
  }
};

/** What a queued text became: written as read, put in the Inbox, or still waiting. */
export type Drained =
  | {
      readonly kind: "done" | "inbox";
      readonly item: QueuedParse;
      readonly inputs: readonly EventInput[];
    }
  | { readonly kind: "wait"; readonly item: QueuedParse };

/**
What a text read later writes without the person looking at it: what it wrote before the
assistant could edit and delete (new tasks, problems added to one, solved, a task closed).
An edit, a delete or an activity waits for the person in the Inbox instead.
*/
const AUTO_APPLIED: ReadonlySet<ProposalKind> = new Set([
  "task.create",
  "task.addSubtasks",
  "task.markSubtasks",
  "task.close",
]);

/** The events a drained text writes, recorded by the server at `now`. */
const stampSystem = (bodies: readonly EventBody[], now: string): readonly EventInput[] =>
  bodies.map((body) => ({ ...body, occurredAt: now, precision: "exact", source: "system" }));

const toInbox = (item: QueuedParse, now: string): Exclude<Drained, { kind: "wait" }> => ({
  inputs: stampSystem([inboxBody(item.text)], now),
  item,
  kind: "inbox",
});

/**
Every proposal planned in order, the text kept as the source of a task it adds to; `null`
when one is not for writing unseen or cannot be planned.
*/
const planAll = (
  proposals: readonly Proposal[],
  world: { readonly state: CoreState; readonly now: string; readonly text: string },
): null | readonly EventInput[] => {
  if (proposals.length === 0 || proposals.some((proposal) => !AUTO_APPLIED.has(proposal.kind))) {
    return null;
  }
  const planned = planProposals(world.state, proposals, {
    deviceTz: world.state.settings.timezone ?? "UTC",
    newId: () => newId(),
    now: world.now,
    source: "system",
    sourceText: world.text,
  });
  return planned.ok ? planned.value : null;
};

/**
Reads one queued text as the assistant would have at the time: the reading the person asked
for is written (it can be undone from History); a text it cannot place, one that asks for an
edit or a delete, or one still unread a day later, goes to the Inbox instead.
*/
export const drainOne = async (
  item: QueuedParse,
  world: {
    readonly state: CoreState;
    readonly now: string;
    readonly providers: readonly ParseProvider[];
    readonly cooldowns: Cooldowns;
  },
): Promise<{ readonly drained: Drained; readonly limited: Cooldowns }> => {
  const { cooldowns, now, providers, state } = world;
  const answer = await readMessage(providers, item.text, {
    clock: () => Date.parse(now),
    cooldowns,
    domain: item.domain ?? "task",
    now,
    state,
  });
  const limited = answer.ok ? answer.value.limited : answer.error.limited;
  if (!answer.ok) {
    const isStale = addMinutesIso(item.enqueuedAt, GIVE_UP_MINUTES) <= now;
    return {
      drained:
        isStale || answer.error.code === "llm/invalid-output"
          ? toInbox(item, now)
          : {
              item: { ...item, retryAt: answer.error.retryAt ?? addMinutesIso(now, RETRY_MINUTES) },
              kind: "wait",
            },
      limited,
    };
  }
  const inputs = planAll(answer.value.proposals, { now, state, text: item.text });
  return {
    drained: inputs === null ? toInbox(item, now) : { inputs, item, kind: "done" },
    limited,
  };
};

/** The store a drain runs in: it reads, derives, writes as the server and logs. */
type DrainStore = {
  readonly read: (now: string) => Promise<{ readonly state: CoreState }>;
  readonly derive: (now: string) => Promise<unknown>;
  readonly apply: (
    inputs: readonly EventInput[],
    meta: { readonly deviceId: string; readonly now: string; readonly source: "system" },
  ) => Promise<Result<unknown, unknown>>;
  readonly logDecisions: (entries: readonly DecisionEntry[], now: string) => Promise<void>;
  /** The user's Telegram chat (see `chatFor`); none means nothing is told. */
  readonly chatId: () => Promise<string | undefined>;
};

export type DrainDeps = {
  readonly storage: DurableObjectStorage;
  readonly env: object;
  readonly now: string;
  readonly store: DrainStore;
};

/** Texts read later are written by the server, as the person asked. */
const SERVER = { deviceId: "server", source: "system" } as const;

const write = async (deps: DrainDeps, inputs: readonly EventInput[]) =>
  await deps.store.apply(inputs, { ...SERVER, now: deps.now });

const stateOf = async (deps: DrainDeps): Promise<CoreState> => {
  const { state } = await deps.store.read(deps.now);
  return state;
};

/** Tells the person in Telegram what became of a text read later; quiet without a bot. */
const tell = async (deps: DrainDeps, isDone: boolean, text: string): Promise<void> => {
  const chatId = await deps.store.chatId();
  const telegram = telegramOf(deps.env);
  if (chatId === undefined || telegram === null) {
    return;
  }
  const state = await stateOf(deps);
  const key = isDone ? "parse.deferredDone" : "parse.deferredInbox";
  await wasTelegramMessageSent(telegram, chatId, {
    buttons: [],
    text: t(state.settings.language, key, { text }),
  });
};

const decisionOf = (item: QueuedParse, isDone: boolean): DecisionEntry => ({
  explanation: isDone
    ? "Read later, as asked when the assistant was out of requests."
    : "Could not be read later; kept in the Inbox.",
  inputs: { channel: item.channel, enqueuedAt: item.enqueuedAt, text: item.text },
  kind: "parse",
  outcome: isDone ? "applied" : "inbox",
  rule: "parse.deferred",
  taskId: null,
});

/** Writes what a drained text became; a reading that cannot be written falls back to the Inbox. */
const settle = async (deps: DrainDeps, drained: Exclude<Drained, { kind: "wait" }>) => {
  const written = await write(deps, drained.inputs);
  const isDone = drained.kind === "done" && written.ok;
  if (!isDone && drained.kind === "done") {
    await write(deps, toInbox(drained.item, deps.now).inputs);
  }
  await deps.store.logDecisions([decisionOf(drained.item, isDone)], deps.now);
  await tell(deps, isDone, drained.item.text);
};

/** One queued text at the alarm: `null` once settled, else the item to keep for later. */
const drainItem = async (
  deps: DrainDeps,
  item: QueuedParse,
  providers: readonly ParseProvider[],
): Promise<null | QueuedParse> => {
  const { now, storage } = deps;
  if (item.retryAt !== null && item.retryAt > now) {
    return item;
  }
  const world = {
    cooldowns: await cooldownsOf(storage, now),
    now,
    providers,
    state: await stateOf(deps),
  };
  const { drained, limited } = await drainOne(item, world);
  await noteLimits(storage, limited, now);
  if (drained.kind === "wait") {
    return drained.item;
  }
  await settle(deps, drained);
  return null;
};

/** Reads every due text of the queue once; what is still out of reach stays for the next alarm. */
export const drainQueue = async (deps: DrainDeps): Promise<void> => {
  const queue = await queueOf(deps.storage);
  const config = loadConfig(deps.env);
  if (queue.length === 0 || !config.ok) {
    return;
  }
  await deps.store.derive(deps.now);
  const providers = parseProviders(config.value);
  const remaining: QueuedParse[] = [];
  for (const item of queue) {
    const kept = await drainItem(deps, item, providers);
    if (kept !== null) {
      remaining.push(kept);
    }
  }
  await saveQueue(deps.storage, remaining);
  await armForQueue(deps.storage, deps.now);
};
