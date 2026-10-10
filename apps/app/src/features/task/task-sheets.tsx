import { useMemo, useState } from "react";

import type { PaceRuntime } from "#app/runtime.ts";

import { useAppState, usePace, useT } from "#app/app-state.tsx";
import { SubtaskList } from "#app/shared/task-fields/subtask-list.tsx";
import { TaskFields, type TaskFormValues } from "#app/shared/task-fields/task-fields.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { taskFormOptions, type TaskPatch, type TaskViewModel } from "@pace/client";

/** The task as the form shows it: its own values (an estimate it never set reads as none). */
const valuesOf = (view: TaskViewModel, deviceTz: string): TaskFormValues => ({
  description: view.description ?? "",
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
  /** Problems added in the sheet. */
  readonly added: readonly string[];
  /** Problems taken off in the sheet. */
  readonly removed: readonly string[];
};

/** The writes a save makes, in order: only what changed. */
const saveSteps = ({ actions, added, before, removed, values, view }: SaveInput) => {
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
    ...removed.map((id) => async () => await actions.removeSubtask(view.id, id)),
    ...(added.length === 0 ? [] : [async () => await actions.addSubtasks(view.id, added)]),
  ];
};

/**
Everything about a task, editable in one place: title, category, importance, project, start,
due (clearable), estimate (clearable), description, link, new problems and unsent ones taken
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
  const { deviceTz } = useViewer();
  const state = useAppState((current) => current);
  const options = useMemo(() => taskFormOptions(state), [state]);
  const before = useMemo(() => valuesOf(view, deviceTz), [view, deviceTz]);
  const [values, setValues] = useState(before);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const save = async (): Promise<void> => {
    const steps = saveSteps({ actions, added, before, removed, values, view });
    for (const step of steps) {
      // One after another: each write is validated against the state the previous one left.
      if (!(await run(step()))) {
        return;
      }
    }
    onClose();
  };
  return (
    <Sheet closeLabel={t("common.close")} onClose={onClose} title={t("edit.title")} visible>
      <TaskFields
        onChange={(patch) => {
          setValues((current) => ({ ...current, ...patch }));
        }}
        options={options}
        values={values}
      />
      <SubtaskList
        items={added}
        kept={view.problems
          .filter((problem) => !removed.includes(problem.id))
          .map((problem) => ({
            id: problem.id,
            isSent: problem.submittedAt !== null,
            label: problem.label,
          }))}
        onChange={setAdded}
        onRemoveKept={(id) => {
          setRemoved((current) => [...current, id]);
        }}
      />
      <SheetActions
        cancelLabel={t("common.cancel")}
        isDisabled={values.title.trim() === ""}
        onCancel={onClose}
        onPrimary={() => {
          void save();
        }}
        primaryLabel={t("common.save")}
      />
    </Sheet>
  );
};
