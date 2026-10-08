import {
  type ActivityButton,
  type ActivityCategory,
  CATEGORY_COLORS,
  effectiveButtons,
  err,
  newId,
  type ProjectColorName,
} from "@pace/core";

import { type ActionDeps, type ActionResult, type Body, emit, stamp } from "./deps.ts";

/** What the button editor sends: the label and the defaults an activity started from it gets. */
export type ButtonDraft = {
  readonly label: string;
  readonly category: ActivityCategory;
  readonly color?: ProjectColorName | undefined;
  readonly taskId?: null | string | undefined;
  readonly expectMinutes: null | number;
  readonly limitMinutes: null | number;
  readonly shouldAskDetails?: boolean | undefined;
};

export type ButtonActions = {
  /** Saves a button (`null` adds one); the first edit turns the defaults into the account's own. */
  readonly saveButton: (buttonId: null | string, draft: ButtonDraft) => ActionResult;
  readonly removeButton: (buttonId: string) => ActionResult;
};

/** Whole positive minutes, or nothing. */
export const positive = (minutes: null | number | undefined): number | undefined =>
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
    shouldAskDetails: button.shouldAskDetails,
    ...(button.taskId !== null && { taskId: button.taskId }),
  },
  type: "activity.button.set",
});

const timeOf = (deps: ActionDeps) => deps.state.store.getState().time;

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

/** The draft's choice, else what the button had. */
const shouldAskOf = (draft: ButtonDraft, existing: ActivityButton | undefined): boolean =>
  draft.shouldAskDetails ?? existing?.shouldAskDetails ?? false;

/** The draft as a button: an existing one keeps its id and place, a new one goes last. */
const buttonOf = (
  draft: ButtonDraft,
  current: readonly ActivityButton[],
  existing?: ActivityButton,
): ActivityButton => ({
  shouldAskDetails: shouldAskOf(draft, existing),
  category: draft.category,
  color: draft.color ?? CATEGORY_COLORS[draft.category],
  expectMinutes: positive(draft.expectMinutes) ?? null,
  id: existing?.id ?? `btn:${newId()}`,
  label: draft.label,
  limitMinutes: positive(draft.limitMinutes) ?? null,
  order: existing?.order ?? Math.max(-1, ...current.map((button) => button.order)) + 1,
  taskId: draft.taskId ?? null,
});

/** The time bar's buttons: save one (the first save writes the defaults) or remove one. */
export const buttonActions = (deps: ActionDeps): ButtonActions => ({
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
