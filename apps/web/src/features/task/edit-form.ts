import type { TaskPatch, TaskViewModel } from "@pace/client";

import { isoToWallClock, wallClockToIso } from "#web/shared/time/wall-clock.ts";
import { err, type Importance, isValidTimeZone, ok, type Result } from "@pace/core";

/** The override sheet's fields as typed; times are `datetime-local` values read in `zone`. */
export type EditForm = {
  readonly presetId: string;
  readonly title: string;
  readonly description: string;
  readonly due: string;
  readonly start: string;
  readonly zone: string;
  readonly importance: Importance;
  /** `null` follows the preset's default. */
  readonly estimate: null | number;
  readonly link: string;
  readonly submitVia: string;
};

export type EditError =
  | "dueInvalid"
  | "dueRequired"
  | "startInvalid"
  | "startRequired"
  | "titleRequired"
  | "zoneInvalid";

/** What saving the sheet writes; absent keys stay as they are. */
export type EditChanges = {
  readonly presetId?: string;
  readonly patch: TaskPatch;
  readonly importance?: Importance;
  readonly estimate?: null | number;
};

/** The sheet as it opens: the task's own zone (else `fallbackTz`) and its effective values. */
export const initialEditForm = (view: TaskViewModel, fallbackTz: string): EditForm => {
  const { overrideSheet: sheet, stats } = view;
  const zone = stats.dueTz ?? stats.startTz ?? fallbackTz;
  return {
    description: view.description ?? "",
    due: stats.dueAt === null ? "" : isoToWallClock(stats.dueAt, zone),
    estimate: sheet.isEstimateOwn ? sheet.estimateMinutes : null,
    importance: sheet.importance,
    presetId: sheet.presetId,
    start: stats.startAt === null ? "" : isoToWallClock(stats.startAt, zone),
    submitVia: view.submitVia ?? "",
    link: view.link?.url ?? "",
    title: view.title,
    zone,
  };
};

type Instant = { readonly error: EditError | null; readonly at: null | string };

/**
A time field: blank stays blank (a due can be moved, not removed, yet); anything typed has
to be a real wall-clock time in a real zone.
*/
type InstantField = {
  readonly value: string;
  readonly had: string;
  readonly invalid: EditError;
  readonly required: EditError;
};

const readInstant = ({ had, invalid, required, value }: InstantField, zone: string): Instant => {
  if (value === "") {
    return { at: null, error: had === "" ? null : required };
  }
  const at = isValidTimeZone(zone) ? wallClockToIso(value, zone) : null;
  return { at, error: at === null && isValidTimeZone(zone) ? invalid : null };
};

const fieldsPatch = (initial: EditForm, form: EditForm): TaskPatch["fields"] | undefined => {
  const fields = {
    ...(form.link !== initial.link && { link: form.link }),
    ...(form.submitVia !== initial.submitVia && { submitVia: form.submitVia }),
  };
  return Object.keys(fields).length === 0 ? undefined : fields;
};

const schedulePatch = (
  { form, initial }: { readonly initial: EditForm; readonly form: EditForm },
  due: Instant,
  start: Instant,
): TaskPatch => {
  const isZoneChanged = form.zone !== initial.zone;
  return {
    ...(due.at !== null &&
      (form.due !== initial.due || isZoneChanged) && { dueAt: due.at, dueTz: form.zone }),
    ...(start.at !== null &&
      (form.start !== initial.start || isZoneChanged) && { startAt: start.at, startTz: form.zone }),
  };
};

const formErrors = (form: EditForm, instants: readonly Instant[]): readonly EditError[] => [
  ...(form.title.trim() === "" ? ["titleRequired" as const] : []),
  ...(isValidTimeZone(form.zone) ? [] : ["zoneInvalid" as const]),
  ...instants.map((instant) => instant.error).filter((error) => error !== null),
];

const taskPatch = (
  pair: { readonly initial: EditForm; readonly form: EditForm },
  due: Instant,
  start: Instant,
): TaskPatch => {
  const { form, initial } = pair;
  const fields = fieldsPatch(initial, form);
  return {
    ...(form.title !== initial.title && { title: form.title }),
    ...(form.description !== initial.description && {
      description: form.description === "" ? null : form.description,
    }),
    ...schedulePatch(pair, due, start),
    ...(fields !== undefined && { fields }),
  };
};

/**
What to write for the sheet, compared with how it opened (so untouched fields write
nothing), or every reason it cannot be saved.
*/
export const editChanges = (
  view: TaskViewModel,
  initial: EditForm,
  form: EditForm,
): Result<EditChanges, readonly EditError[]> => {
  const due = readInstant(
    { had: initial.due, invalid: "dueInvalid", required: "dueRequired", value: form.due },
    form.zone,
  );
  const start = readInstant(
    { had: initial.start, invalid: "startInvalid", required: "startRequired", value: form.start },
    form.zone,
  );
  const errors = formErrors(form, [due, start]);
  if (errors.length > 0) {
    return err(errors);
  }
  const patch = taskPatch({ form, initial }, due, start);
  return ok({
    patch,
    ...(form.presetId !== view.overrideSheet.presetId && { presetId: form.presetId }),
    ...(form.importance !== initial.importance && { importance: form.importance }),
    ...(form.estimate !== initial.estimate && { estimate: form.estimate }),
  });
};
