import type { CoreState } from "../materialize/core-state.ts";
import type { Task } from "../model/task.ts";
import type { ModelAction, ModelOutput, ParseField } from "../parse/schema.ts";
import type { ActionContext } from "./context.ts";
import type { ActionBody, TaskDraft } from "./schema.ts";

import { parseQuickInput, type QuickInput, shortTitle } from "../input/parse-quick-input.ts";
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
import { type ActionKind, domainOf, type ParseDomain } from "./kinds.ts";
import { draftOfInput } from "./rules.ts";

/** A action read from the model, with the fields it gave without a quote from the message. */
export type ModelReading = {
  readonly body: ActionBody;
  readonly doubtful: readonly ParseField[];
};

/** Why an action of the model's answer was left out. */
export type ReadingRejection = "action/incomplete" | "action/other-domain" | ActionRejection;

export type Rejected = {
  readonly index: number;
  readonly kind: ActionKind;
  readonly reason: ReadingRejection;
};

export type ModelWorld = {
  readonly state: CoreState;
  readonly ctx: QueryContext;
  /** The lists the prompt showed: aliases map back through them. */
  readonly context: ActionContext;
  /** The request the actions are built from, verbatim: the first message of a thread. */
  readonly text: string;
  /**
  Everything the person wrote in the thread, corrections included: what a field may quote.
  Never the task's text: a correction is neither its description nor its source.
  */
  readonly evidence?: string;
  /** Only actions of this domain are kept. */
  readonly domain: ParseDomain;
};

type Converted = Result<ActionBody, "action/incomplete">;

/** A model name wins only when it resolves; the typed hashtag may still name a known project. */
const projectIdOf = (action: ModelAction, rules: TaskDraft, state: CoreState): null | string =>
  (isGiven(action.project) ? projectOf(state, action.project) : null) ?? rules.projectId;

/** Plain one-line text is already the task's name; a model cannot move words out of it. */
const createText = (
  action: ModelAction,
  input: QuickInput,
  rules: TaskDraft,
): Pick<TaskDraft, "description" | "title"> =>
  input.spans.length === 0 && input.description === null
    ? { description: null, title: rules.title }
    : {
        description: action.description ?? rules.description,
        title: titleOf(action).title ?? rules.title,
      };

/**
A create: what the model found wins, the composer's rules fill the rest, so the same fields
show either way. The message is kept verbatim as the task's source.
*/
const createOf = (action: ModelAction, world: ModelWorld): Converted => {
  const { ctx, state, text } = world;
  const input = parseQuickInput(text, state, ctx);
  const rules = draftOfInput(input, state);
  const zone = accountTz(state, ctx);
  const dueAt = dueOf(action, zone);
  return ok({
    kind: "task.create",
    task: {
      ...rules,
      projectId: projectIdOf(action, rules, state),
      projectName: null,
      dueAt: dueAt ?? rules.dueAt,
      dueTz: dueAt === null ? rules.dueTz : (rules.dueTz ?? zone),
      estimateMinutes: action.estimateMinutes ?? rules.estimateMinutes,
      importance: action.importance ?? rules.importance,
      link: linkOf(action, text),
      presetId: presetOf(state, action.category) ?? rules.presetId,
      subtasks: subtasksOf(action).length === 0 ? rules.subtasks : [...subtasksOf(action)],
      ...createText(action, input, rules),
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

const nonEmpty = (body: ActionBody, size: number): Converted =>
  size === 0 ? err("action/incomplete") : ok(body);

type TaskEditKind = Exclude<Extract<ActionKind, `task.${string}`>, "task.create">;

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
    ? err("action/incomplete")
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

type Outcome = { readonly index: number; readonly kind: ActionKind } & (
  | { readonly reading: ModelReading }
  | { readonly reason: ReadingRejection }
);

const isRead = (outcome: Outcome): outcome is Extract<Outcome, { readonly reading: unknown }> =>
  "reading" in outcome;

const isLeftOut = (outcome: Outcome): outcome is Extract<Outcome, { readonly reason: unknown }> =>
  "reason" in outcome;

/** One action: left out when of another domain or unchecked, else its action. */
const outcomeOf = (action: ModelAction, index: number, world: ModelWorld): Outcome => {
  const { context, ctx, state } = world;
  const at = { index, kind: action.kind };
  if (domainOf(action.kind) !== world.domain) {
    return { ...at, reason: "action/other-domain" };
  }
  const projectNames = Object.values(state.projects.byId).map((project) => project.name);
  const verified = verifyAction(action, {
    context,
    projectNames,
    source: world.evidence ?? world.text,
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
The model's answer as actions: each action checked (`verifyAction`), its aliases mapped back
to ids, its wall-clock times read in the account's zone. Actions of another domain than the
one asked, and ones that cannot be checked or completed, are left out and listed as rejected.
*/
export const actionsFromModel = (
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
