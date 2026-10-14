import type {
  Answer,
  CalendarEvent,
  CoreState,
  EventInput,
  NewNotification,
  NotificationKind,
  PoolNotification,
  PresetDefinition,
  RequestDomain,
  Resolution,
  Result,
  RetroError,
  SyncEvent,
  Task,
  UsageRow,
} from "@pace/core";

export type { SyncEvent } from "@pace/core";

/**
A JSON value as read back from storage. Deliberately not recursive: the Durable Object
RPC types (`Rpc.Serializable`) cannot expand a recursive alias.
*/
export type JsonValue = boolean | null | number | object | string;

/** An event as read back from the log: the payload is known to be JSON (it was stored as such). */
export type StoredEvent = Omit<SyncEvent, "payload"> & { readonly payload: JsonValue };

/**
A task as it crosses the RPC boundary: `overrides` is an opaque record in core (`unknown`
values, which RPC types refuse), so it travels as the validated preset definition it is.
A Worker-side reader uses an `RpcState` as a `CoreState` without conversion.
*/
export type RpcTask = Omit<Task, "overrides"> & { readonly overrides: null | PresetDefinition };

export type RpcState = Omit<CoreState, "tasks"> & {
  readonly tasks: { readonly byId: Readonly<Record<string, RpcTask>> };
};

/** Who is writing through `apply`: the envelope fields the store stamps on every input. */
export type ApplyMeta = {
  /** `system`: what the server writes on the person's behalf (a text read later, as asked). */
  readonly source: "app" | "bot" | "mcp" | "system" | "web";
  readonly deviceId: string;
  /** Server time as ISO: `recordedAt`, and the clock the retro rules check against. */
  readonly now: string;
};

export type ApplyErrorCode = "event/invalid" | "event/not-found" | RetroError;

/** The first input the store refused, and why. */
export type ApplyError = {
  readonly code: ApplyErrorCode;
  readonly index: number;
};

export type ReadResult = {
  readonly state: RpcState;
  readonly seq: number;
};

export type ApplyResult = {
  /** The events as stored, in batch order. */
  readonly events: readonly StoredEvent[];
  readonly state: RpcState;
  readonly seq: number;
};

export type DryRunResult = {
  readonly events: readonly StoredEvent[];
  /** The state the batch would produce (a correction alone leaves it as it is). */
  readonly state: RpcState;
};

/** The part of the user store that readers outside the Durable Object (MCP, bot) use. */
export type UserStoreApi = {
  readonly read: (now: string) => Promise<ReadResult>;
  /** The phone's calendar copy overlapping a range. */
  readonly calendar: (range: {
    readonly from: string;
    readonly to: string;
  }) => Promise<readonly CalendarEvent[]>;
  /** App sessions on every device overlapping a range. */
  readonly usage: (range: {
    readonly from: string;
    readonly to: string;
  }) => Promise<readonly UsageRow[]>;
  readonly apply: (
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ) => Promise<Result<ApplyResult, ApplyError>>;
  readonly dryRun: (
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ) => Promise<Result<DryRunResult, ApplyError>>;
  readonly find: (id: string) => Promise<StoredEvent | undefined>;
  readonly decisions: (query: DecisionQuery) => Promise<readonly DecisionRecord[]>;
  /** The log after `since`, a page at a time (`export_all`). */
  readonly list: (since: number, limit: number) => Promise<EventPage>;
  /** One read-only SQL query over the store's tables (`query_sql`). */
  readonly querySql: (sql: string) => Promise<Result<SqlRows, SqlError>>;
  readonly describeSchema: () => Promise<readonly TableSchema[]>;
  readonly simulate: (args: SimulationArgs) => Promise<Simulation>;
  /**
  Adds a notification to the pool and delivers it to every channel its kind is on for (the
  sessions feature calls it with a sign-in); a payload its kind's schema refuses is not added.
  */
  readonly notify: (
    created: NewNotification,
    now: string,
  ) => Promise<Result<PoolNotification, NotifyError>>;
};

/** Why a notification was not added: its payload breaks its kind's contract. */
export type NotifyError = { readonly code: "notification/invalid" };

export type EventPage = {
  readonly events: readonly StoredEvent[];
  readonly seq: number;
  readonly more: boolean;
};

export type TableSchema = { readonly name: string; readonly sql: string };

export type SqlError = {
  readonly code: "sql/failed" | "sql/forbidden" | "sql/not-select";
  readonly message: string;
};

export type SqlRows = {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly JsonValue[])[];
  /** More rows matched than the limit. */
  readonly truncated: boolean;
};

export type SimulationArgs = {
  readonly from: string;
  readonly to: string;
};

export type SimulatedMessage = {
  readonly at: string;
  readonly kind: NotificationKind;
  readonly taskId: null | string;
  readonly text: string;
};

export type Simulation = {
  readonly messages: readonly SimulatedMessage[];
  /** The step limit cut the range short. */
  readonly isCut: boolean;
};

/** What the bot uses besides reading and writing: previews kept until a button is pressed. */
export type BotStoreApi = Pick<UserStoreApi, "apply" | "read"> & {
  readonly remember: (key: string, value: JsonValue) => Promise<void>;
  readonly recall: (key: string) => Promise<JsonValue | undefined>;
  /** Where notifications go: the user's chat with the bot. */
  readonly notifyTo: (chatId: string, now: string) => Promise<void>;
  /** Answers a notification of the pool (a button in the chat). */
  readonly resolveNotification: (
    id: string,
    resolution: Resolution,
    meta: ResolveMeta,
  ) => Promise<Result<PoolNotification, ResolveError>>;
  readonly logDecisions: (entries: readonly DecisionEntry[], now: string) => Promise<void>;
  /** Providers known to be rate limited at `now` → when they are back. */
  readonly llmCooldowns: (now: string) => Promise<Readonly<Record<string, string>>>;
  readonly noteLlmLimits: (limited: Readonly<Record<string, string>>, now: string) => Promise<void>;
  /** Keeps a text to read once the assistant is back. */
  readonly enqueueParse: (
    item: {
      readonly channel: "api" | "bot";
      /** The field it was typed into; a text kept before fields existed is a task's. */
      readonly domain?: RequestDomain | undefined;
      readonly retryAt: null | string;
      readonly text: string;
    },
    now: string,
  ) => Promise<void>;
};

/** One row of the decision log, as the API returns it. */
export type DecisionRecord = {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly taskId: null | string;
  readonly rule: string;
  readonly inputs: JsonValue;
  readonly outcome: string;
  readonly explanation: string;
};

/** A decision as its maker records it; the store stamps the id and the time. */
export type DecisionEntry = Omit<DecisionRecord, "at" | "id">;

export type DecisionQuery = {
  readonly taskId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /** Case-insensitive text search over rule, outcome, explanation and inputs. */
  readonly q?: string | undefined;
  readonly limit: number;
};

/**
Where an answer to a notification came from. Telegram edits its own message; from anywhere else
the Telegram copy is deleted.
*/
export type AnswerOrigin = "app" | "system" | "telegram" | "web";

export type ResolveMeta = { readonly origin: AnswerOrigin; readonly now: string };

export type ResolveErrorCode = "notification/mismatch" | "notification/not-found" | ApplyErrorCode;

/** Why an answer was refused: no such notification, not an answer for its kind, or the write failed. */
export type ResolveError = { readonly code: ResolveErrorCode };

/**
Callback data of a pool notification's buttons, `<code>:<notificationId>`: sent by the store,
handled by the bot.
*/
export const POOL_ACTIONS = {
  attended: "na",
  skipped: "ns",
  still: "nk",
  stopped: "nx",
} as const satisfies Record<Answer, string>;
