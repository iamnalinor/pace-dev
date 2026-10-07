import type {
  CoreState,
  EventInput,
  PresetDefinition,
  Result,
  RetroError,
  SyncEvent,
  Task,
} from "@pace/core";

export type { Observation, SyncEvent } from "@pace/core";

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
  readonly source: "bot" | "mcp";
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
  readonly apply: (
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ) => Promise<Result<ApplyResult, ApplyError>>;
  readonly dryRun: (
    inputs: readonly EventInput[],
    meta: ApplyMeta,
  ) => Promise<Result<DryRunResult, ApplyError>>;
  readonly find: (id: string) => Promise<StoredEvent | undefined>;
};

/** What the bot uses besides reading and writing: previews kept until a button is pressed. */
export type BotStoreApi = Pick<UserStoreApi, "apply" | "read"> & {
  readonly remember: (key: string, value: JsonValue) => Promise<void>;
  readonly recall: (key: string) => Promise<JsonValue | undefined>;
  /** Where notifications go: the user's chat with the bot. */
  readonly notifyTo: (chatId: string, now: string) => Promise<void>;
  /** Silences a task's alerts until `until`. */
  readonly snoozeTask: (taskId: string, until: string, now: string) => Promise<void>;
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

export type DecisionQuery = {
  readonly taskId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /** Case-insensitive text search over rule, outcome, explanation and inputs. */
  readonly q?: string | undefined;
  readonly limit: number;
};

/** Callback data of the notification buttons, `<action>:<taskId>`: sent by the store, handled by the bot. */
export const NOTIFY_ACTIONS = { cancel: "x", done: "d", snooze: "z" } as const;
