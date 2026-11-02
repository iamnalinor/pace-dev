import { ChevronUp, X } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { isDeadlineChoiceValid } from "#app/shared/task-fields/deadline-choice.ts";
import { OptionRow } from "#app/shared/task-fields/option-row.tsx";
import { SubtaskList } from "#app/shared/task-fields/subtask-list.tsx";
import { TaskFields, type TaskFormValues } from "#app/shared/task-fields/task-fields.tsx";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { cx } from "#app/ui/cx.ts";
import { HOTKEYS, labelWithHotkey } from "#app/ui/hotkeys.ts";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { Tooltip } from "#app/ui/tooltip.tsx";
import { HotkeyLayer, KEYBOARD, useHotkey } from "#app/ui/use-hotkey.tsx";
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
  const { palette } = useTheme();
  useHotkey(HOTKEYS.escape, onClose);
  // The second Enter, wherever the focus is outside a field or a button; ⌘↵ from anywhere.
  useHotkey(HOTKEYS.enter, onAdd);
  useHotkey(HOTKEYS.primary, onAdd);
  const CloseIcon = variant === "pane" ? X : ChevronUp;
  return (
    <View className="flex-row items-center gap-2">
      <Text
        accessibilityRole="header"
        className={cx(
          "flex-1 font-sans font-semibold text-label-primary",
          variant === "pane" ? "text-title2 font-normal" : "pl-1 text-callout",
        )}
      >
        {title}
      </Text>
      <View className="shrink">
        <Button disabled={!canAdd} hotkey={HOTKEYS.enter} hotkeyMode="hint" onPress={onAdd}>
          {actionLabel}
        </Button>
      </View>
      <Tooltip
        label={labelWithHotkey(t("common.close"), HOTKEYS.escape, KEYBOARD)}
        showsOnTap={false}
      >
        <Pressable
          accessibilityLabel={t("common.close")}
          accessibilityRole="button"
          className="h-hit-web w-hit-web items-center justify-center rounded-md active:opacity-70"
          onPress={onClose}
        >
          <CloseIcon color={palette["label.secondary"]} size={20} strokeWidth={1.75} />
        </Pressable>
      </Tooltip>
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
  subtaskDraft,
}: {
  readonly isTitleFocused: boolean;
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
            model.canAdd &&
            (!model.isDeadlineOwn || isDeadlineChoiceValid(model.deadlinePolicy, model.due))
          }
          onAdd={onAdd}
          onClose={onClose}
          title={title}
          variant={variant}
        />
        {status}
        <FormFields
          isTitleFocused={isTitleFocused}
          model={model}
          onAdd={onAdd}
          onEdit={onEdit}
          subtaskDraft={subtaskDraft}
        />
      </View>
    </HotkeyLayer>
  );
};
