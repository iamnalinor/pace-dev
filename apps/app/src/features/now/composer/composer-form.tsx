import { ChevronUp } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppState, useT } from "#app/app-state.tsx";
import { OptionRow } from "#app/shared/task-fields/option-row.tsx";
import { SubtaskList } from "#app/shared/task-fields/subtask-list.tsx";
import { TaskFields, type TaskFormValues } from "#app/shared/task-fields/task-fields.tsx";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { HOTKEYS } from "#app/ui/hotkeys.ts";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { HotkeyLayer, useHotkey } from "#app/ui/use-hotkey.tsx";
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

/** "Check before adding" and the fold back to the line, where the line's own chevron was. */
const FormHeader = ({
  onAdd,
  onCollapse,
}: {
  readonly onAdd: () => void;
  readonly onCollapse: () => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  useHotkey(HOTKEYS.escape, onCollapse);
  // The second Enter, wherever the focus is outside a field or a button.
  useHotkey(HOTKEYS.enter, onAdd);
  return (
    <View className="flex-row items-center justify-between">
      <Text accessibilityRole="header" className="font-sans text-[13px] font-medium text-fg2">
        {t("composer.formTitle")}
      </Text>
      <Pressable
        accessibilityLabel={t("composer.collapse")}
        accessibilityRole="button"
        aria-expanded
        className="h-9 w-9 items-center justify-center rounded-md active:opacity-70"
        hitSlop={4}
        onPress={onCollapse}
      >
        <ChevronUp color={palette.muted} size={18} strokeWidth={2} />
      </Pressable>
    </View>
  );
};

/** The form's body: where the text goes, then the fields (or only the details for a week). */
const FormFields = ({
  isTitleFocused,
  model,
  onAdd,
  onEdit,
}: {
  readonly isTitleFocused: boolean;
  readonly model: ComposerModel;
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
          values={values}
        />
      )}
      <SubtaskList
        items={model.subtasks.map((subtask) => subtask.label)}
        onChange={(labels) => {
          onEdit({ subtasks: labels.map((label) => subtaskOf(label)) });
        }}
      />
    </>
  );
};

/**
The composer unfolded into the task form, in place: every field labelled, so a long message
never silently becomes a long title. Enter in the title (or ⌘↵ anywhere) adds it, Escape or
the chevron folds it back to the line. Adding to a week's homework asks only for what the
message brings to it.
*/
export const ComposerForm = ({
  isTitleFocused,
  model,
  onAdd,
  onCollapse,
  onEdit,
  status,
}: {
  readonly model: ComposerModel;
  /** The line moved into the title by hand: the cursor follows it. */
  readonly isTitleFocused: boolean;
  /** What the assistant made of the message: what to double-check, its questions. */
  readonly status: ReactNode;
  readonly onEdit: (edits: ComposerEdits) => void;
  readonly onAdd: () => void;
  readonly onCollapse: () => void;
}) => {
  const t = useT();
  const isInstance = model.target.kind === "instance";
  const title = model.title === "" ? model.text.trim() : model.title;
  return (
    <HotkeyLayer>
      <View accessibilityLabel={t("composer.formTitle")} className="gap-3.5 p-2" role="form">
        <FormHeader onAdd={onAdd} onCollapse={onCollapse} />
        {status}
        <FormFields isTitleFocused={isTitleFocused} model={model} onAdd={onAdd} onEdit={onEdit} />
        <Button disabled={!isInstance && title === ""} hotkey={HOTKEYS.primary} onPress={onAdd}>
          {model.target.kind === "instance"
            ? t("composer.addTo", { title: model.target.title })
            : t("form.create")}
        </Button>
      </View>
    </HotkeyLayer>
  );
};
