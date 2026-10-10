import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

import type { CoreState, EventInput, QueryContext, Result } from "@pace/core";

import type { ApplyError, StoredEvent } from "../shared/contract.ts";
import type { ToolContext } from "./registry.ts";

/** Events written through MCP carry this device id (one connection is one "device"). */
export const MCP_DEVICE_ID = "mcp";

/** The instant and precision a mutating tool records its events with. */
export type When = {
  readonly at: string;
  readonly precision: "approx" | "exact";
};

export type WriteArgs = {
  readonly at?: string | undefined;
  readonly precision?: "approx" | "exact" | undefined;
  readonly dryRun?: boolean | undefined;
};

/** A refusal a tool answers with: the Result code and a sentence the caller can show. */
export type ToolFailure = {
  readonly code: string;
  readonly message: string;
};

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  "event/invalid": "The event would not pass the event schema.",
  "event/not-found": "No event with this id is in the log.",
  "fetch/not-found": "No task or project with this id.",
  "inbox/empty": "The text is empty.",
  "preset/bad-id": "A preset id is a lowercase slug (a-z, 0-9, '.', '-').",
  "preset/built-in":
    "The default presets (hw, work, personal, deferred, inbox) cannot be re-created or re-parented, and the inbox cannot be archived.",
  "preset/cycle": "The preset would extend itself through its parents.",
  "preset/exists": "A preset with this id already exists.",
  "preset/invalid-definition": "The definition has a key or value the preset schema does not know.",
  "preset/invalid-overrides": "The task's overrides are not a valid preset definition.",
  "preset/no-base": "A preset must extend a built-in preset or another user preset.",
  "preset/self-extends": "A preset cannot extend itself.",
  "preset/unknown": "No preset with this id (see list_presets).",
  "preset/unknown-parent": "The parent preset does not exist.",
  "project/unknown": "No project with this id or name.",
  "retro/before-created": "`at` is before the task was created.",
  "retro/future": "`at` is in the future; events are recorded for now or the past.",
  "retro/nothing-to-submit": "Nothing is solved and unsubmitted, so there is nothing to send.",
  "retro/task-closed": "The task is closed; reopen it first.",
  "review/no-action": "The review item for this task does not offer this action.",
  "review/no-item": "Nothing to review for this task.",
  "subtask/submitted": "That subtask was already submitted; it stays on the task.",
  "subtask/unknown": "No such subtask on this task.",
  "task/unknown": "No task with this id.",
};

export const describeCode = (code: string): string => CODE_MESSAGES[code] ?? code;

/** A tool error (`isError`): the code is the first word, so a caller can switch on it. */
export const failure = (code: string, message = describeCode(code)): CallToolResult => ({
  content: [{ text: `${code}: ${message}`, type: "text" }],
  isError: true,
  structuredContent: { error: { code, message } },
});

export const failed = (problem: ToolFailure): CallToolResult =>
  failure(problem.code, problem.message);

export const success = (structured: Record<string, unknown>, summary: string): CallToolResult => ({
  content: [{ text: summary, type: "text" }],
  structuredContent: structured,
});

/** MCP has no device zone: the account zone decides, and UTC until one is set. */
export const queryContext = (state: CoreState, now: string): QueryContext => ({
  deviceTz: state.settings.timezone ?? "UTC",
  now,
});

/** What every renderer reads: the state, the query context and where links point. */
export type Scope = {
  readonly state: CoreState;
  readonly qctx: QueryContext;
  readonly webOrigin: string;
};

const scopeOf = (ctx: ToolContext, state: CoreState): Scope => ({
  qctx: queryContext(state, ctx.now),
  state,
  webOrigin: ctx.webOrigin,
});

export type Rendered = {
  readonly structured: Record<string, unknown>;
  readonly summary: string;
};

export type ReadStep = (scope: Scope) => Result<Rendered, ToolFailure>;

/** A read tool: the current state (system events derived) rendered once. */
export const runRead = async (ctx: ToolContext, step: ReadStep): Promise<CallToolResult> => {
  const { state } = await ctx.store.read(ctx.now);
  const rendered = step(scopeOf(ctx, state));
  return rendered.ok
    ? success(rendered.value.structured, rendered.value.summary)
    : failed(rendered.error);
};

/** Distributive over the event union, so `type` and `payload` stay correlated in the spread. */
type Payload<I = EventInput> = I extends { readonly type: unknown; readonly payload: unknown }
  ? Pick<I, "payload" | "type">
  : never;

/** An event as MCP records it: the caller's instant and precision, source `mcp`. */
export const stamp = (when: When, body: Payload): EventInput => ({
  ...body,
  occurredAt: when.at,
  precision: when.precision,
  source: "mcp",
});

export const EVENT_REF = z.object({ id: z.string(), occurredAt: z.string(), type: z.string() });

/** Every mutating tool answers these on top of its own fields. */
export const WRITE_OUTPUT = {
  dryRun: z.boolean().describe("true when nothing was written (preview only)."),
  events: z.array(EVENT_REF).describe("The events recorded (or, on a dry run, previewed)."),
};

const eventRefs = (events: readonly StoredEvent[]) =>
  events.map((event) => ({ id: event.id, occurredAt: event.occurredAt, type: event.type }));

export type Build = (scope: Scope, when: When) => Result<readonly EventInput[], ToolFailure>;

/** A build for a write about one existing thing (a task, a preset), handed the thing found. */
export type TargetBuild<T> = (
  scope: Scope,
  when: When,
  target: T,
) => Result<readonly EventInput[], ToolFailure>;

/** Finds the target first: its refusal (`task/unknown`, `preset/unknown`) wins over the build. */
export const withTarget =
  <T>(lookup: (scope: Scope) => Result<T, ToolFailure>, build: TargetBuild<T>): Build =>
  (scope, when) => {
    const target = lookup(scope);
    return target.ok ? build(scope, when, target.value) : target;
  };

export type Render = (scope: Scope, events: readonly StoredEvent[]) => Rendered;

export type WriteSteps = {
  /** The events the call means, built against the current state. */
  readonly build: Build;
  /** The answer, rendered from the state after the write (or the dry-run preview). */
  readonly render: Render;
};

const refusal = (inputs: readonly EventInput[], error: ApplyError): string =>
  `${describeCode(error.code)} (event ${error.index}: ${inputs[error.index]?.type ?? "?"})`;

/**
A mutating tool: read the state, build the events, write them through the store (or
preview them on a dry run), render the outcome. Refusals become tool errors with the
Result code; nothing throws.
*/
export const runWrite = async (
  ctx: ToolContext,
  args: WriteArgs,
  steps: WriteSteps,
): Promise<CallToolResult> => {
  const when: When = { at: args.at ?? ctx.now, precision: args.precision ?? "exact" };
  const isDryRun = args.dryRun === true;
  const { state } = await ctx.store.read(ctx.now);
  const inputs = steps.build(scopeOf(ctx, state), when);
  if (!inputs.ok) {
    return failed(inputs.error);
  }
  const meta = { deviceId: MCP_DEVICE_ID, now: ctx.now, source: "mcp" as const };
  const result = isDryRun
    ? await ctx.store.dryRun(inputs.value, meta)
    : await ctx.store.apply(inputs.value, meta);
  if (!result.ok) {
    return failure(result.error.code, refusal(inputs.value, result.error));
  }
  const rendered = steps.render(scopeOf(ctx, result.value.state), result.value.events);
  return success(
    { dryRun: isDryRun, events: eventRefs(result.value.events), ...rendered.structured },
    `${isDryRun ? "Dry run: nothing was written. " : ""}${rendered.summary}`,
  );
};
