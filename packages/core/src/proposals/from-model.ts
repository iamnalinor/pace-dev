import type { CoreState } from "../materialize/core-state.ts";
import type { Task } from "../model/task.ts";
import type { ModelAction, ModelOutput, ParseField } from "../parse/schema.ts";
import type { ProposalContext } from "./context.ts";
import type { ProposalBody } from "./schema.ts";

import { parseQuickInput, shortTitle } from "../input/parse-quick-input.ts";
import { extractLink } from "../links.ts";
import { type ActionRejection, type VerifiedAction, verifyAction } from "../parse/verify.ts";
import { accountTz, type QueryContext } from "../queries/context.ts";
import { err, ok, type Result } from "../result.ts";
import { activityOf } from "./from-model-activity.ts";
import {
  dueOf,
  isGiven,
  patchOf,
  presetOf,
  projectOf,
  subtaskIdsOf,
  subtasksOf,
} from "./from-model-task.ts";
import { domainOf, type ParseDomain, type ProposalKind } from "./kinds.ts";
import { draftOfInput } from "./rules.ts";

/** A proposal read from the model, with the fields it gave without a quote from the message. */
export type ModelReading = {
  readonly body: ProposalBody;
  readonly doubtful: readonly ParseField[];
};

/** Why an action of the model's answer was left out. */
export type ReadingRejection = "proposal/incomplete" | "proposal/other-domain" | ActionRejection;

export type Rejected = {
  readonly index: number;
  readonly kind: ProposalKind;
  readonly reason: ReadingRejection;
};

export type ModelWorld = {
  readonly state: CoreState;
  readonly ctx: QueryContext;
  /** The lists the prompt showed: aliases map back through them. */
  readonly context: ProposalContext;
  /** The message, verbatim. */
  readonly text: string;
  /** Only proposals of this domain are kept. */
  readonly domain: ParseDomain;
};

type Converted = Result<ProposalBody, "proposal/incomplete">;

/**
A create: what the model found wins, the composer's rules fill the rest, so the same fields
show either way. The message is kept verbatim as the task's source.
*/
const createOf = (action: ModelAction, world: ModelWorld): Converted => {
  const { ctx, state, text } = world;
  const rules = draftOfInput(parseQuickInput(text, state, ctx));
  const zone = accountTz(state, ctx);
  const dueAt = dueOf(action, zone);
  const project = isGiven(action.project) ? projectOf(state, action.project) : {};
  return ok({
    kind: "task.create",
    task: {
      ...rules,
      ...project,
      description: action.description ?? rules.description,
      dueAt: dueAt ?? rules.dueAt,
      dueTz: dueAt === null ? rules.dueTz : (rules.dueTz ?? zone),
      estimateMinutes: action.estimateMinutes ?? rules.estimateMinutes,
      importance: action.importance ?? rules.importance,
      link: linkOf(action, text),
      presetId: presetOf(state, action.category) ?? rules.presetId,
      subtasks: subtasksOf(action).length === 0 ? rules.subtasks : [...subtasksOf(action)],
      ...titleOf(action),
    },
  });
};

/** The link the model gave, else the first one in the message. */
const linkOf = (action: ModelAction, text: string): null | string =>
  action.link ?? extractLink(text);

/** A title the model kept long (the whole message) is cut like a typed one. */
const titleOf = (action: ModelAction): { readonly title?: string } => {
  const title = isGiven(action.title) ? shortTitle(action.title) : "";
  return title === "" ? {} : { title };
};

const nonEmpty = (body: ProposalBody, size: number): Converted =>
  size === 0 ? err("proposal/incomplete") : ok(body);

type TaskEditKind = Exclude<Extract<ProposalKind, `task.${string}`>, "task.create">;

type TaskEdit = (task: Task, action: ModelAction, world: ModelWorld) => Converted;

/** Each task edit from the action the model gave, by the task it named. */
const TASK_EDITS: Readonly<Record<TaskEditKind, TaskEdit>> = {
  "task.addSubtasks": (task, action) =>
    nonEmpty(
      { kind: "task.addSubtasks", subtasks: [...subtasksOf(action)], taskId: task.id },
      subtasksOf(action).length,
    ),
  "task.close": (task, action) =>
    ok({ kind: "task.close", outcome: action.outcome ?? "done", taskId: task.id }),
  "task.delete": (task) => ok({ kind: "task.delete", taskId: task.id }),
  "task.markSubtasks": (task, action) => {
    const subtaskIds = subtaskIdsOf(task, action.subtaskRefs);
    return nonEmpty(
      { kind: "task.markSubtasks", subtaskIds: [...subtaskIds], taskId: task.id },
      subtaskIds.length,
    );
  },
  "task.update": (task, action, world) => {
    const patch = patchOf(task, action, { ctx: world.ctx, state: world.state });
    return nonEmpty({ kind: "task.update", patch, taskId: task.id }, Object.keys(patch).length);
  },
};

const taskEditOf = (verified: VerifiedAction, world: ModelWorld): Converted => {
  const task = verified.task === null ? undefined : world.state.tasks.byId[verified.task.id];
  return task === undefined
    ? err("proposal/incomplete")
    : TASK_EDITS[verified.action.kind as TaskEditKind](task, verified.action, world);
};

const bodyOf = (verified: VerifiedAction, world: ModelWorld): Converted => {
  if (verified.action.kind === "task.create") {
    return createOf(verified.action, world);
  }
  return domainOf(verified.action.kind) === "task"
    ? taskEditOf(verified, world)
    : activityOf(verified, { state: world.state, text: world.text });
};

type Outcome = { readonly index: number; readonly kind: ProposalKind } & (
  | { readonly reading: ModelReading }
  | { readonly reason: ReadingRejection }
);

const isRead = (outcome: Outcome): outcome is Extract<Outcome, { readonly reading: unknown }> =>
  "reading" in outcome;

const isLeftOut = (outcome: Outcome): outcome is Extract<Outcome, { readonly reason: unknown }> =>
  "reason" in outcome;

/** One action: left out when of another domain or unchecked, else its proposal. */
const outcomeOf = (action: ModelAction, index: number, world: ModelWorld): Outcome => {
  const { context, ctx, state, text } = world;
  const at = { index, kind: action.kind };
  if (domainOf(action.kind) !== world.domain) {
    return { ...at, reason: "proposal/other-domain" };
  }
  const projectNames = Object.values(state.projects.byId).map((project) => project.name);
  const verified = verifyAction(action, {
    context,
    projectNames,
    source: text,
    zone: accountTz(state, ctx),
  });
  if (!verified.ok) {
    return { ...at, reason: verified.error };
  }
  const body = bodyOf(verified.value, world);
  return body.ok
    ? { ...at, reading: { body: body.value, doubtful: verified.value.doubtful } }
    : { ...at, reason: body.error };
};

/**
The model's answer as proposals: each action checked (`verifyAction`), its aliases mapped back
to ids, its wall-clock times read in the account's zone. Actions of another domain than the
one asked, and ones that cannot be checked or completed, are left out and listed as rejected.
*/
export const proposalsFromModel = (
  output: ModelOutput,
  world: ModelWorld,
): { readonly readings: readonly ModelReading[]; readonly rejected: readonly Rejected[] } => {
  const outcomes = output.actions.map((action, index) => outcomeOf(action, index, world));
  return {
    readings: outcomes.filter(isRead).map((outcome) => outcome.reading),
    rejected: outcomes
      .filter(isLeftOut)
      .map(({ index, kind, reason }) => ({ index, kind, reason })),
  };
};
