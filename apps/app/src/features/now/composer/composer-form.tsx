import { type ReactNode, useMemo, useState } from "react";
import { View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { isDeadlineChoiceValid } from "#app/shared/task-fields/deadline-choice.ts";
import { SubtaskList } from "#app/shared/task-fields/subtask-list.tsx";
import { TaskFields, type TaskFormValues } from "#app/shared/task-fields/task-fields.tsx";
import { Button, KeyHintRoomContext } from "#app/ui/button.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { IconButton } from "#app/ui/icon-button.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { Text } from "#app/ui/text.tsx";
import { TimeCheckScope, useCheckedSubmit, useTimeChecks } from "#app/ui/time-check.tsx";
import { HotkeyLayer, useHotkey } from "#app/ui/use-hotkey.tsx";
import { type ComposerEdits, type ComposerModel, taskFormOptions } from "@pace/client";

import { subtaskOf } from "./composer-flow.tsx";

/** The form's values from the composer's reading: the edits over the rules' reading of the text. */
const valuesOf = (model: ComposerModel): TaskFormValues => ({
  description: model.description ?? "",
  deadlinePolicy: model.deadlinePolicy,
  recurrence: model.recurrence,
  due: model.due,
  estimateMinutes: model.estimateMinutes,
  importance: model.importance,
  link: model.link?.url ?? "",
  newProjectName: model.newProjectName,
  presetId: model.preset.id,
  projectId: model.project?.id ?? null,
  start: model.start,
  title: model.title,
});

/** The "Add to" row's choice of a task of its own, beside the homework instances. */
const OWN_TASK = "own-task";

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
    <RadioChips
      choices={[
        ...model.instances.map((instance) => ({ text: instance.title, value: instance.id })),
        { text: t("form.ownTask"), value: OWN_TASK },
      ]}
      label={t("form.addTo")}
      onChange={(choice) => {
        onEdit({ targetTaskId: choice === OWN_TASK ? null : choice });
      }}
      value={current ?? OWN_TASK}
    />
  );
};

/**
The form's title, its action and its close, all at the top: the action is in sight however long
the form. The close is a cross in the pane (as on a dialog), a chevron up in the line's card
(the form folds back into the line); either way Escape does it.
*/
const FormHeader = ({
  actionLabel,
  canAdd,
  onAdd,
  onClose,
  title,
  variant,
}: {
  readonly actionLabel: string;
  readonly canAdd: boolean;
  readonly onAdd: () => void;
  readonly onClose: () => void;
  readonly title: string;
  readonly variant: FormVariant;
}) => {
  const t = useT();
  useHotkey(HOTKEYS.escape, onClose);
  // The second Enter, wherever the focus is outside a field or a button; ⌘↵ from anywhere.
  useHotkey(HOTKEYS.enter, onAdd);
  useHotkey(HOTKEYS.primary, onAdd);
  const closeIcon = variant === "pane" ? "x" : "chevron-up";
  return (
    <View className="flex-row items-center gap-2">
      <Text className="flex-1" level={2} role={variant === "pane" ? "title2" : "headline"}>
        {title}
      </Text>
      <View className="shrink">
        {/* In the 400 px pane the header has no room for the shortcut (the activity pane's title
        wrapped beside it, design review 2 N11); the shortcut still works. */}
        <KeyHintRoomContext value={variant !== "pane"}>
          <Button disabled={!canAdd} onPress={onAdd} shortcut={HOTKEYS.primary} shortcutMode="hint">
            {actionLabel}
          </Button>
        </KeyHintRoomContext>
      </View>
      <IconButton icon={closeIcon} label={t("common.close")} onPress={onClose} />
    </View>
  );
};

/** The form's body: where the text goes, then the fields (or only the details for a week). */
/** The subtask being typed into the form's field (Create keeps it), owned by the composer. */
type SubtaskDraft = { readonly value: string; readonly onChange: (value: string) => void };

const FormFields = ({
  isTitleFocused,
  model,
  onAdd,
  onEdit,
  submitTries,
  subtaskDraft,
}: {
  readonly isTitleFocused: boolean;
  readonly submitTries: number;
  readonly model: ComposerModel;
  readonly subtaskDraft: SubtaskDraft;
  readonly onEdit: (edits: ComposerEdits) => void;
  readonly onAdd: () => void;
}) => {
  const t = useT();
  // The whole state is a stable reference until it changes; the options are derived from it.
  const state = useAppState((current) => current);
  const options = useMemo(() => taskFormOptions(state), [state]);
  const values = valuesOf(model);
  const change = (patch: Partial<TaskFormValues>): void => {
    onEdit(editsOf(patch));
  };
  return (
    <>
      <TargetRow model={model} onEdit={onEdit} />
      {model.target.kind === "instance" ? (
        <TextField
          label={t("edit.description")}
          multiline
          onChangeText={(description) => {
            change({ description });
          }}
          value={values.description}
        />
      ) : (
        <TaskFields
          isTitleFocused={isTitleFocused}
          onChange={change}
          onSubmit={onAdd}
          options={options}
          repeatProblem={model.repeatProblem}
          showDeadlineIssue={model.isDeadlineOwn}
          submitTries={submitTries}
          values={values}
        />
      )}
      <SubtaskList
        draft={subtaskDraft.value}
        items={model.subtasks.map((subtask) => subtask.label)}
        onChange={(labels) => {
          onEdit({ subtasks: labels.map((label) => subtaskOf(label)) });
        }}
        onDraftChange={subtaskDraft.onChange}
      />
    </>
  );
};

/** In the line's card (a phone), or in Now's right pane (a computer). */
export type FormVariant = "card" | "pane";

/**
The task form: every field labelled, so a long message never silently becomes a long title.
Enter in the title (or ⌘↵ anywhere) adds it, Escape or the close control closes it. Adding to a
week's homework asks only for what the message brings to it.
*/
export const ComposerForm = ({
  isTitleFocused,
  model,
  onAdd,
  onClose,
  onEdit,
  status,
  subtaskDraft,
  title,
  variant,
}: {
  readonly model: ComposerModel;
  readonly subtaskDraft: SubtaskDraft;
  /** The form just opened: the cursor goes to the title. */
  readonly isTitleFocused: boolean;
  /** What the assistant made of the message: what to double-check, its questions. */
  readonly status: ReactNode;
  /** "New task", or where the suggestion came from. */
  readonly title: string;
  readonly variant: FormVariant;
  readonly onEdit: (edits: ComposerEdits) => void;
  readonly onAdd: () => void;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const [submitTries, setSubmitTries] = useState(0);
  const times = useTimeChecks();
  const isTitleMissing = model.target.kind !== "instance" && model.title.trim() === "";
  // With no title, Create (and its keys) says what is missing instead of doing nothing (R24-06).
  // A time typed and not readable refuses Create, said under its field (R27-02); one handed over
  // by the press is created with (review I3).
  const add = useCheckedSubmit(times, () => {
    if (isTitleMissing) {
      setSubmitTries((tries) => tries + 1);
      return;
    }
    onAdd();
  });
  return (
    <HotkeyLayer>
      <View
        accessibilityLabel={title}
        className={variant === "pane" ? "gap-4" : "gap-4 p-2"}
        role="form"
      >
        <FormHeader
          actionLabel={
            model.target.kind === "instance"
              ? t("composer.addTo", { title: model.target.title })
              : t("form.create")
          }
          canAdd={
            (model.canAdd || isTitleMissing) &&
            (!model.isDeadlineOwn || isDeadlineChoiceValid(model.deadlinePolicy, model.due))
          }
          onAdd={add}
          onClose={onClose}
          title={title}
          variant={variant}
        />
        {status}
        <TimeCheckScope checks={times}>
          <FormFields
            isTitleFocused={isTitleFocused}
            model={model}
            onAdd={add}
            onEdit={onEdit}
            submitTries={submitTries}
            subtaskDraft={subtaskDraft}
          />
        </TimeCheckScope>
      </View>
    </HotkeyLayer>
  );
};
