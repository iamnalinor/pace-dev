import { type ReactNode, useMemo } from "react";
import { Text, View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { OptionRow } from "#app/shared/task-fields/option-row.tsx";
import { SubtaskList } from "#app/shared/task-fields/subtask-list.tsx";
import { TaskFields, type TaskFormValues } from "#app/shared/task-fields/task-fields.tsx";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { SheetActions } from "#app/ui/sheet-actions.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { type ComposerEdits, type ComposerModel, taskFormOptions } from "@pace/client";

/** The form's values from the composer's reading: the edits over the rules' reading of the text. */
const valuesOf = (model: ComposerModel): TaskFormValues => ({
  description: model.description ?? "",
  due: model.due,
  estimateMinutes: model.estimateMinutes,
  importance: model.importance,
  link: model.link?.url ?? "",
  newProjectName: model.newProjectName,
  presetId: model.preset.id,
  projectId: model.project?.id ?? null,
  start: model.start,
  title: model.title === "" ? model.text.trim() : model.title,
});

/** A changed link: a blank one clears the link. */
const linkEdit = (link: string | undefined): ComposerEdits =>
  link === undefined ? {} : { link: link.trim() === "" ? null : link.trim() };

/**
A change in the form, as the composer's edits: the fields that share a name pass through, a
new category takes its own importance, a project name and a link are renamed or cleaned.
*/
const editsOf = (patch: Partial<TaskFormValues>): ComposerEdits => {
  const { link, newProjectName, presetId, ...same } = patch;
  return {
    ...same,
    ...(presetId !== undefined && { importance: patch.importance, presetId }),
    ...(newProjectName !== undefined && { projectName: newProjectName }),
    ...linkEdit(link),
  };
};

/** A bare number is a problem number ("290"); anything else is a label. */
const subtaskOf = (label: string): ComposerModel["subtasks"][number] => {
  const number = /^\d+$/u.test(label) ? Number(label) : null;
  return { label, number };
};

/** For a weekly course: this week's homework, another open week, or a task of its own. */
const TargetRow = ({
  model,
  onEdit,
}: {
  readonly model: ComposerModel;
  readonly onEdit: (edits: ComposerEdits) => void;
}) => {
  const t = useT();
  if (model.instances.length === 0) {
    return null;
  }
  const current = model.target.kind === "instance" ? model.target.taskId : null;
  return (
    <OptionRow label={t("form.addTo")}>
      {model.instances.map((instance) => (
        <Chip
          key={instance.id}
          onPress={() => {
            onEdit({ targetTaskId: instance.id });
          }}
          selected={instance.id === current}
        >
          {instance.title}
        </Chip>
      ))}
      <Chip
        onPress={() => {
          onEdit({ targetTaskId: null });
        }}
        selected={current === null}
      >
        {t("form.ownTask")}
      </Chip>
    </OptionRow>
  );
};

/**
The task form the composer opens after reading a message (or by hand): every field labelled,
so a long message never silently becomes a long title. Adding to a week's homework asks only
for what the message brings to it.
*/
export const ComposerForm = ({
  model,
  onAdd,
  onBack,
  onEdit,
  status,
}: {
  readonly model: ComposerModel;
  /** What the assistant made of the message: what to double-check, its questions. */
  readonly status: ReactNode;
  readonly onEdit: (edits: ComposerEdits) => void;
  readonly onAdd: () => void;
  readonly onBack: () => void;
}) => {
  const t = useT();
  // The whole state is a stable reference until it changes; the options are derived from it.
  const state = useAppState((current) => current);
  const options = useMemo(() => taskFormOptions(state), [state]);
  const values = valuesOf(model);
  const change = (patch: Partial<TaskFormValues>): void => {
    onEdit(editsOf(patch));
  };
  const isInstance = model.target.kind === "instance";
  return (
    <View
      accessibilityLabel={t("form.newTask")}
      className="mx-4 mb-3 gap-3.5 rounded-xl border border-line bg-surface p-3.5"
      role="form"
    >
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-sans text-[16px] font-semibold text-fg">
          {t("composer.formTitle")}
        </Text>
        <Button onPress={onBack} variant="ghost">
          {t("composer.backToText")}
        </Button>
      </View>
      {status}
      <TargetRow model={model} onEdit={onEdit} />
      {isInstance ? (
        <TextField
          label={t("edit.description")}
          multiline
          onChangeText={(description) => {
            change({ description });
          }}
          value={values.description}
        />
      ) : (
        <TaskFields onChange={change} options={options} values={values} />
      )}
      <SubtaskList
        items={model.subtasks.map((subtask) => subtask.label)}
        onChange={(labels) => {
          onEdit({ subtasks: labels.map((label) => subtaskOf(label)) });
        }}
      />
      <SheetActions
        cancelLabel={t("common.cancel")}
        isDisabled={!isInstance && values.title.trim() === ""}
        onCancel={onBack}
        onPrimary={onAdd}
        primaryLabel={
          model.target.kind === "instance"
            ? t("composer.addTo", { title: model.target.title })
            : t("form.create")
        }
      />
    </View>
  );
};
