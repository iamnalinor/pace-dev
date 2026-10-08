import {
  type ActivityButton,
  type ActivityCategory,
  CATEGORY_COLORS,
  defaultsFor,
  effectiveButtons,
  err,
  newId,
  ok,
  type ProjectColorName,
  runningActivity,
  taskById,
} from "@pace/core";

import { type ActionDeps, type ActionResult, type Body, emit, stamp, type When } from "./deps.ts";

/** What the button editor sends: the label and the defaults an activity started from it gets. */
export type ButtonDraft = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color?: ProjectColorName | undefined;
  readonly taskId?: null | string | undefined;
  readonly expectMinutes: null | number;
  readonly limitMinutes: null | number;
};

export type ActivityInput = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly taskId?: string | undefined;
  /** Omitted: learned from the label's past runs, else the category's default. */
  readonly expectMinutes?: null | number | undefined;
  readonly limitMinutes?: null | number | undefined;
};

/** What the Day sheet edits: an existing block (move and rename) or a new past one. */
export type ActivityTarget =
  | {
      readonly kind: "edit";
      readonly activityId: string;
      readonly label: string;
      readonly category: ActivityCategory;
      readonly startAt: string;
      /** `null` while it runs: only the start can move. */
      readonly endAt: null | string;
    }
  | { readonly kind: "log"; readonly startAt: string; readonly endAt: string };

/** The sheet's fields once read: the end is `null` for a block still running. */
export type ActivityEntry = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: null | string;
};

export type PastActivity = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly startAt: string;
  readonly endAt: string;
  readonly taskId?: string | undefined;
};

export type TimeActions = {
  /** One tap on the time bar: starts the button's activity (ending the running one), or stops it if it is the one running. */
  readonly tapButton: (buttonId: string) => ActionResult;
  readonly startActivity: (input: ActivityInput, when?: When) => ActionResult;
  /** Time on a task: its title as the label, its estimate as the Expect. */
  readonly focusTask: (taskId: string) => ActionResult;
  readonly stopActivity: (when?: When) => ActionResult;
  readonly logPast: (activity: PastActivity) => ActionResult;
  /** The Day sheet's save: logs a new block, or moves and renames an existing one. */
  readonly saveActivity: (target: ActivityTarget, entry: ActivityEntry) => ActionResult;
  readonly adjustActivity: (
    activityId: string,
    change: { readonly startAt?: string; readonly endAt?: string },
  ) => ActionResult;
  readonly relabelActivity: (
    activityId: string,
    change: {
      readonly label?: string;
      readonly category?: ActivityCategory;
      readonly taskId?: null | string;
    },
  ) => ActionResult;
  /** Saves a button (`null` adds one). The first edit writes the default buttons as the account's own. */
  readonly saveButton: (buttonId: null | string, draft: ButtonDraft) => ActionResult;
  readonly removeButton: (buttonId: string) => ActionResult;
};

const positive = (minutes: null | number | undefined): number | undefined =>
  minutes === null || minutes === undefined || minutes <= 0 ? undefined : Math.round(minutes);

const buttonBody = (button: ActivityButton): Body => ({
  payload: {
    buttonId: button.id,
    category: button.category,
    color: button.color,
    expectMinutes: button.expectMinutes,
    label: button.label,
    limitMinutes: button.limitMinutes,
    order: button.order,
    ...(button.taskId !== null && { taskId: button.taskId }),
  },
  type: "activity.button.set",
});

const timeOf = (deps: ActionDeps) => deps.state.store.getState().time;

const startActivity = async (
  deps: ActionDeps,
  input: Parameters<TimeActions["startActivity"]>[0],
  when: When = {},
): ActionResult => {
  const label = input.label.trim();
  if (label === "") {
    return err("action/empty-text");
  }
  const learned = defaultsFor(timeOf(deps), { category: input.category, label });
  const expectMinutes = positive(
    input.expectMinutes === undefined ? learned.expectMinutes : input.expectMinutes,
  );
  const limitMinutes = positive(
    input.limitMinutes === undefined ? learned.limitMinutes : input.limitMinutes,
  );
  return await emit(deps, [
    stamp(
      deps,
      {
        payload: {
          activityId: newId(),
          category: input.category,
          label,
          ...(input.taskId !== undefined && { taskId: input.taskId }),
          ...(expectMinutes !== undefined && { expectMinutes }),
          ...(limitMinutes !== undefined && { limitMinutes }),
        },
        type: "activity.started",
      },
      when,
    ),
  ]);
};

const stopActivity = async (deps: ActionDeps, when: When = {}): ActionResult => {
  const running = runningActivity(timeOf(deps), when.at ?? deps.clock.now());
  return running === null
    ? err("action/nothing-to-do")
    : await emit(deps, [
        stamp(deps, { payload: { activityId: running.id }, type: "activity.stopped" }, when),
      ]);
};

/** The bar as it stands; the first edit turns the defaults into the account's own buttons. */
const writeButtons = async (
  deps: ActionDeps,
  buttons: readonly ActivityButton[],
  removed: readonly string[],
): ActionResult =>
  await emit(deps, [
    ...buttons.map((button) => stamp(deps, buttonBody(button))),
    ...removed.map((buttonId) =>
      stamp(deps, { payload: { buttonId }, type: "activity.button.removed" }),
    ),
  ]);

/** The draft as a button: an existing one keeps its id and place, a new one goes last. */
const buttonOf = (
  draft: ButtonDraft,
  current: readonly ActivityButton[],
  existing?: ActivityButton,
): ActivityButton => ({
  category: draft.category,
  color: draft.color ?? CATEGORY_COLORS[draft.category],
  expectMinutes: positive(draft.expectMinutes) ?? null,
  id: existing?.id ?? `btn:${newId()}`,
  label: draft.label,
  limitMinutes: positive(draft.limitMinutes) ?? null,
  order: existing?.order ?? Math.max(-1, ...current.map((button) => button.order)) + 1,
  taskId: draft.taskId ?? null,
});

const buttonActions = (deps: ActionDeps): Pick<TimeActions, "removeButton" | "saveButton"> => ({
  removeButton: async (buttonId) => {
    const current = effectiveButtons(timeOf(deps));
    if (current.every((button) => button.id !== buttonId)) {
      return err("action/nothing-to-do");
    }
    return timeOf(deps).hasCustomButtons
      ? await writeButtons(deps, [], [buttonId])
      : await writeButtons(
          deps,
          current.filter((button) => button.id !== buttonId),
          [],
        );
  },
  saveButton: async (buttonId, draft) => {
    const label = draft.label.trim();
    if (label === "") {
      return err("action/empty-text");
    }
    const current = effectiveButtons(timeOf(deps));
    const existing = current.find((button) => button.id === buttonId);
    const saved = buttonOf({ ...draft, label }, current, existing);
    const others = timeOf(deps).hasCustomButtons
      ? []
      : current.filter((button) => button.id !== saved.id);
    return await writeButtons(deps, [...others, saved], []);
  },
});

const tapButton = async (deps: ActionDeps, buttonId: string): ActionResult => {
  const button = effectiveButtons(timeOf(deps)).find((candidate) => candidate.id === buttonId);
  if (button === undefined) {
    return err("action/nothing-to-do");
  }
  if (runningActivity(timeOf(deps), deps.clock.now())?.buttonId === buttonId) {
    return await stopActivity(deps);
  }
  return await emit(deps, [
    stamp(deps, {
      payload: {
        activityId: newId(),
        buttonId,
        category: button.category,
        label: button.label,
        ...(button.taskId !== null && { taskId: button.taskId }),
        ...(button.expectMinutes !== null && { expectMinutes: button.expectMinutes }),
        ...(button.limitMinutes !== null && { limitMinutes: button.limitMinutes }),
      },
      type: "activity.started",
    }),
  ]);
};

const logPast = async (deps: ActionDeps, activity: PastActivity): ActionResult => {
  const label = activity.label.trim();
  if (label === "" || Date.parse(activity.endAt) <= Date.parse(activity.startAt)) {
    return err("action/invalid-input");
  }
  return await emit(deps, [
    stamp(
      deps,
      {
        payload: {
          activityId: newId(),
          category: activity.category,
          endAt: activity.endAt,
          label,
          startAt: activity.startAt,
          ...(activity.taskId !== undefined && { taskId: activity.taskId }),
        },
        type: "activity.logged",
      },
      { at: activity.endAt },
    ),
  ]);
};

/** Corrections of a block already on the ledger: its boundaries and its name. */
const editActions = (
  deps: ActionDeps,
): Pick<TimeActions, "adjustActivity" | "relabelActivity"> => ({
  adjustActivity: async (activityId, change) => {
    const activity = timeOf(deps).activities[activityId];
    if (activity === undefined) {
      return err("event/not-found");
    }
    const startAt = change.startAt ?? activity.startAt;
    const endAt = change.endAt ?? activity.endAt;
    if (endAt !== null && Date.parse(endAt) <= Date.parse(startAt)) {
      return err("action/invalid-input");
    }
    return await emit(deps, [
      stamp(deps, { payload: { activityId, ...change }, type: "activity.adjusted" }),
    ]);
  },
  relabelActivity: async (activityId, change) =>
    timeOf(deps).activities[activityId] === undefined
      ? err("event/not-found")
      : await emit(deps, [
          stamp(deps, { payload: { activityId, ...change }, type: "activity.labelled" }),
        ]),
});

/** Moves the block if its boundaries changed, then renames it if its name or category did. */
const saveEdit = async (
  deps: ActionDeps,
  target: Extract<ActivityTarget, { kind: "edit" }>,
  entry: ActivityEntry,
): ActionResult => {
  const edits = editActions(deps);
  const isMoved = entry.startAt !== target.startAt || (entry.endAt !== null && entry.endAt !== target.endAt);
  const moved = isMoved
    ? await edits.adjustActivity(target.activityId, {
        startAt: entry.startAt,
        ...(entry.endAt !== null && target.endAt !== null && { endAt: entry.endAt }),
      })
    : ok([]);
  if (!moved.ok) {
    return moved;
  }
  const isRenamed = entry.label.trim() !== target.label || entry.category !== target.category;
  const renamed = isRenamed
    ? await edits.relabelActivity(target.activityId, { category: entry.category, label: entry.label.trim() })
    : ok([]);
  return renamed.ok ? ok([...moved.value, ...renamed.value]) : renamed;
};

const saveActivity = async (deps: ActionDeps, target: ActivityTarget, entry: ActivityEntry): ActionResult => {
  if (target.kind === "edit") {
    return await saveEdit(deps, target, entry);
  }
  return entry.endAt === null
    ? err("action/invalid-input")
    : await logPast(deps, { category: entry.category, endAt: entry.endAt, label: entry.label, startAt: entry.startAt });
};

export const timeActions = (deps: ActionDeps): TimeActions => ({
  ...buttonActions(deps),
  ...editActions(deps),
  saveActivity: async (target, entry) => await saveActivity(deps, target, entry),
  focusTask: async (taskId) => {
    const task = taskById(deps.state.store.getState().tasks, taskId);
    return task === undefined
      ? err("task/unknown")
      : await startActivity(deps, {
          category: "task",
          expectMinutes: task.estimateMinutes,
          label: task.title.slice(0, 80),
          limitMinutes: null,
          taskId,
        });
  },
  logPast: async (activity) => await logPast(deps, activity),
  startActivity: async (input, when) => await startActivity(deps, input, when),
  stopActivity: async (when) => await stopActivity(deps, when),
  tapButton: async (buttonId) => await tapButton(deps, buttonId),
});
