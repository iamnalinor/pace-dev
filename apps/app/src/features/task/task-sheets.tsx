import { useMemo, useState } from "react";

import type { PaceRuntime } from "#app/runtime.ts";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { isDeadlineChoiceValid } from "#app/shared/task-fields/deadline-choice.ts";
import { SubtaskList, withDraft } from "#app/shared/task-fields/subtask-list.tsx";
import { TaskFields, type TaskFormValues } from "#app/shared/task-fields/task-fields.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { taskFormOptions, type TaskPatch, type TaskViewModel } from "@pace/client";
import { isUntilBeforeStart, type SeriesSchedule } from "@pace/core";

/** The task as the form shows it: its own values (an estimate it never set reads as none). */
const valuesOf = (
  view: TaskViewModel,
  deviceTz: string,
  recurrence: null | SeriesSchedule,
): TaskFormValues => ({
  description: view.description ?? "",
  deadlinePolicy: view.stats.deadlinePolicy,
  recurrence,
  due:
    view.stats.dueAt === null ? null : { at: view.stats.dueAt, tz: view.stats.dueTz ?? deviceTz },
  estimateMinutes: view.overrideSheet.isEstimateOwn ? view.overrideSheet.estimateMinutes : null,
  importance: view.overrideSheet.importance,
  link: view.link?.url ?? "",
  newProjectName: null,
  presetId: view.overrideSheet.presetId,
  projectId: view.project?.id ?? null,
  start: { at: view.stats.startAt, tz: view.stats.startTz ?? deviceTz },
  title: view.title,
});

const isSameTime = (a: TaskFormValues["due"], b: TaskFormValues["due"]): boolean =>
  a?.at === b?.at && a?.tz === b?.tz;

/** A changed policy, or a changed due under a two-stage one, must still make a valid pair. */
const deadlineStatus = (before: TaskFormValues, after: TaskFormValues) => {
  const isChanged =
    JSON.stringify(after.deadlinePolicy) !== JSON.stringify(before.deadlinePolicy) ||
    (after.deadlinePolicy.kind !== "hard" && !isSameTime(before.due, after.due));
  return {
    changed: isChanged,
    valid: !isChanged || isDeadlineChoiceValid(after.deadlinePolicy, after.due),
  };
};

/**
Every refusal a save's later steps could meet, checked before its first write (bug class 32):
the actions refuse the same last repeat date through the same predicate.
*/
const isRecurrenceValid = (
  values: TaskFormValues,
  fallback: { readonly at: string; readonly tz: string },
): boolean =>
  values.recurrence === null || !isUntilBeforeStart(values.recurrence, values.start ?? fallback);

/** A changed date as the patch writes it: the new time with its zone, or `null` to clear. */
const timePatch = (
  key: "due" | "start",
  before: TaskFormValues["due"],
  after: TaskFormValues["due"],
): TaskPatch => {
  if (isSameTime(before, after)) {
    return {};
  }
  if (key === "due") {
    return after === null ? { dueAt: null } : { dueAt: after.at, dueTz: after.tz };
  }
  return after === null ? { startAt: null } : { startAt: after.at, startTz: after.tz };
};

/** The changed title, description and link. */
const textPatch = (before: TaskFormValues, after: TaskFormValues): TaskPatch => ({
  ...(after.title !== before.title && { title: after.title.trim() }),
  ...(after.description !== before.description && {
    description: after.description.trim() === "" ? null : after.description,
  }),
  ...(after.link !== before.link &&
    after.link.trim() !== "" && { fields: { link: after.link.trim() } }),
});

/** What `updateTask` takes: the changed text fields and dates. */
const patchOf = (before: TaskFormValues, after: TaskFormValues): TaskPatch => ({
  ...textPatch(before, after),
  ...timePatch("due", before.due, after.due),
  ...timePatch("start", before.start, after.start),
});

type SaveInput = {
  readonly actions: PaceRuntime["actions"];
  readonly view: TaskViewModel;
  readonly before: TaskFormValues;
  readonly values: TaskFormValues;
  /** Subtasks added in the sheet. */
  readonly added: readonly string[];
  /** Subtasks taken off in the sheet. */
  readonly removed: readonly string[];
  readonly seriesId: null | string;
};

/** New and removed subtasks while the editor is open. */
const useSubtaskEdits = () => {
  const [added, setAdded] = useState<readonly string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [removed, setRemoved] = useState<readonly string[]>([]);
  return { added, removed, setAdded, setRemoved, setSubtaskDraft, subtaskDraft };
};

/** The writes a save makes, in order: only what changed. */
const saveSteps = ({ actions, added, before, removed, seriesId, values, view }: SaveInput) => {
  const patch = patchOf(before, values);
  return [
    ...(Object.keys(patch).length === 0
      ? []
      : [async () => await actions.updateTask(view.id, patch)]),
    ...(values.presetId === before.presetId
      ? []
      : [async () => await actions.setPreset(view.id, values.presetId)]),
    ...(values.projectId === before.projectId
      ? []
      : [
          async () =>
            await actions.setProject(
              view.id,
              values.projectId === null ? null : { projectId: values.projectId },
            ),
        ]),
    ...(values.importance === before.importance
      ? []
      : [async () => await actions.setImportance(view.id, values.importance)]),
    ...(values.estimateMinutes === before.estimateMinutes
      ? []
      : [async () => await actions.setEstimate(view.id, values.estimateMinutes)]),
    ...(JSON.stringify(values.deadlinePolicy) === JSON.stringify(before.deadlinePolicy)
      ? []
      : [
          async () =>
            await actions.setOverrides(view.id, {
              ...view.overrideSheet.overrides,
              deadlinePolicy: values.deadlinePolicy,
            }),
        ]),
    ...(JSON.stringify(values.recurrence) === JSON.stringify(before.recurrence)
      ? []
      : [
          async () => {
            if (seriesId === null) {
              return values.recurrence === null
                ? await actions.updateTask(view.id, {})
                : await actions.startSeriesForTask(view.id, values.recurrence);
            }
            return values.recurrence === null
              ? await actions.archiveSeries(seriesId, view.id)
              : await actions.updateSeries(seriesId, values.recurrence);
          },
        ]),
    ...removed.map((id) => async () => await actions.removeSubtask(view.id, id)),
    ...(added.length === 0 ? [] : [async () => await actions.addSubtasks(view.id, added)]),
  ];
};

/** Runs the steps in order and stops at the first refusal; true when all went through. */
const didRunAll = async (
  run: ReturnType<typeof useRunAction>,
  steps: ReturnType<typeof saveSteps>,
): Promise<boolean> => {
  for (const step of steps) {
    if (!(await run(step()))) {
      return false;
    }
  }
  return true;
};

/**
Everything about a task, editable in one place: title, category, importance, project, start,
due (clearable), estimate (clearable), description, link, new subtasks and unsent ones taken
off. Only what changed is written.
*/
export const EditTaskSheet = ({
  onClose,
  view,
}: {
  readonly view: TaskViewModel;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const { deviceTz, now } = useViewer();
  const state = useAppState((current) => current);
  const seriesId = state.tasks.byId[view.id]?.seriesId ?? null;
  const recurrence = seriesId === null ? null : (state.series.byId[seriesId]?.schedule ?? null);
  const options = useMemo(() => taskFormOptions(state), [state]);
  const before = useMemo(() => valuesOf(view, deviceTz, recurrence), [view, deviceTz, recurrence]);
  const [values, setValues] = useState(before);
  const { added, removed, setAdded, setRemoved, setSubtaskDraft, subtaskDraft } = useSubtaskEdits();
  const deadline = deadlineStatus(before, values);
  const save = async (): Promise<void> => {
    const steps = saveSteps({
      actions,
      added: withDraft(added, subtaskDraft),
      before,
      removed,
      seriesId,
      values,
      view,
    });
    if (await didRunAll(run, steps)) {
      onClose();
    }
  };
  return (
    <Sheet
      closeLabel={t("common.close")}
      footer={
        <SheetActions
          isDisabled={
            values.title.trim() === "" ||
            !deadline.valid ||
            !isRecurrenceValid(values, { at: now, tz: deviceTz })
          }
          onPrimary={() => {
            void save();
          }}
          primaryLabel={t("common.save")}
        />
      }
      onClose={onClose}
      title={t("edit.title")}
      visible
    >
      <TaskFields
        onChange={(patch) => {
          setValues((current) => ({ ...current, ...patch }));
        }}
        options={options}
        showDeadlineIssue={deadline.changed}
        values={values}
      />
      <SubtaskList
        draft={subtaskDraft}
        items={added}
        kept={view.subtasks
          .filter((subtask) => !removed.includes(subtask.id))
          .map((subtask) => ({
            id: subtask.id,
            isSent: subtask.submittedAt !== null,
            label: subtask.label,
          }))}
        onChange={setAdded}
        onDraftChange={setSubtaskDraft}
        onRemoveKept={(id) => {
          setRemoved((current) => [...current, id]);
        }}
      />
    </Sheet>
  );
};
