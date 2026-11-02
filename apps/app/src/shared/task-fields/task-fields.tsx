import { useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import type { RepeatChangeProblem } from "@pace/client";

import { useLanguage, useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { Chip } from "#app/ui/chip.tsx";
import { IMPORTANCE_HUES } from "#app/ui/color.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { ImportanceSchema, presetLabel } from "@pace/core";

import type { TaskFormOptions, TaskFormValues } from "./task-form-types.ts";

import { DatePanel } from "./date-field.tsx";
import { DeadlineAndRepeat, DueBeforeStartNote } from "./deadline-and-repeat.tsx";
import { EstimateOptions } from "./estimate-field.tsx";
import { OptionRow } from "./option-row.tsx";
import { TaskTextFields } from "./task-text-fields.tsx";
import { useOutsidePress } from "./use-outside-press.ts";
import { WhenChips } from "./when-chips.tsx";

export type { TaskFormOptions, TaskFormValues } from "./task-form-types.ts";

type Panel = "due" | "estimate" | "start" | null;

/** Start, due and estimate as chips; a chip opens its panel (a calendar with a time, or a list). */
const WhenFields = ({
  fallback,
  onChange,
  onClose,
  panel,
  setPanel,
  values,
}: {
  readonly values: TaskFormValues;
  /** The category's estimate, used while the task has none of its own. */
  readonly fallback: null | number;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  readonly panel: Panel;
  readonly setPanel: (panel: Panel) => void;
  readonly onClose: () => void;
}) => {
  const wrapperRef = useRef<View>(null);
  useOutsidePress(wrapperRef, panel === "due" || panel === "start", onClose);
  const toggle = (next: Exclude<Panel, null>): void => {
    setPanel(panel === next ? null : next);
  };
  const close = (): void => {
    setPanel(null);
  };
  return (
    <View
      className="gap-2"
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      ref={wrapperRef}
    >
      <WhenChips fallback={fallback} panel={panel} toggle={toggle} values={values} />
      {panel === "start" || panel === "due" ? (
        <DatePanel
          key={panel}
          kind={panel}
          onChange={(value) => {
            onChange(panel === "start" ? { start: value } : { due: value });
          }}
          onClose={close}
          value={panel === "start" ? values.start : values.due}
        />
      ) : null}
      {panel === "estimate" ? (
        <EstimateOptions
          fallback={fallback}
          minutes={values.estimateMinutes}
          onEstimate={(estimateMinutes) => {
            onChange({ estimateMinutes });
            close();
          }}
        />
      ) : null}
    </View>
  );
};

/** Category, importance and project as one-tap rows. */
const ChoiceFields = ({
  onChange,
  options,
  values,
}: {
  readonly values: TaskFormValues;
  readonly options: TaskFormOptions;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
}) => {
  const t = useT();
  const language = useLanguage();
  return (
    <>
      <OptionRow label={t("composer.category")}>
        {options.presets.map((preset) => (
          <Chip
            color={preset.color}
            key={preset.id}
            onPress={() => {
              onChange({ presetId: preset.id });
            }}
            selected={preset.id === values.presetId}
          >
            {presetLabel(preset, language)}
          </Chip>
        ))}
      </OptionRow>
      <OptionRow label={t("edit.importance")}>
        {ImportanceSchema.options.map((importance) => (
          <Chip
            color={IMPORTANCE_HUES[importance]}
            key={importance}
            onPress={() => {
              onChange({ importance });
            }}
            selected={importance === values.importance}
          >
            {t(`importance.${importance}`)}
          </Chip>
        ))}
      </OptionRow>
      <OptionRow label={t("composer.project")}>
        <Chip
          onPress={() => {
            onChange({ newProjectName: null, projectId: null });
          }}
          selected={values.projectId === null && values.newProjectName === null}
        >
          {t("composer.noProject")}
        </Chip>
        {values.newProjectName === null ? null : (
          <Chip onPress={() => undefined} selected>
            {t("composer.newProject", { name: values.newProjectName })}
          </Chip>
        )}
        {options.projects.map((project) => (
          <Chip
            color={project.color}
            key={project.id}
            label={t("composer.projectNamed", { name: project.name })}
            onPress={() => {
              onChange({ newProjectName: null, projectId: project.id });
            }}
            selected={project.id === values.projectId}
          >
            {project.name}
          </Chip>
        ))}
      </OptionRow>
    </>
  );
};

/**
The fields of a task, labelled one by one: title, category, importance, project, start, due,
estimate, description and link. The composer's form and the task editor both draw it.
*/
export const TaskFields = ({
  isTitleFocused = false,
  onChange,
  onSubmit,
  options,
  isStartChosen,
  repeatProblem = null,
  showDeadlineIssue = false,
  values,
}: {
  readonly values: TaskFormValues;
  readonly options: TaskFormOptions;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  /** Enter in the title: the composer's second Enter adds the task. */
  readonly onSubmit?: () => void;
  /** The cursor lands in the title (the composer's line moved there). */
  readonly isTitleFocused?: boolean;
  readonly showDeadlineIssue?: boolean;
  /** Why the repeat choice could not be saved (the editor checks it before any write). */
  readonly repeatProblem?: null | RepeatChangeProblem;
  /** The start is the person's (the editor shows an automatic one too): only then is a
  deadline before it worth a note. */
  readonly isStartChosen?: boolean;
}) => {
  const t = useT();
  const titleRef = useRef<TextInput>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [isFinalOpen, setIsFinalOpen] = useState(false);
  // A fresh form does not open blaming the title the person has not typed yet (QA round 14 L6);
  // once typed and cleared it asks for one.
  const [isTitleTouched, setIsTitleTouched] = useState(false);
  // Not `autoFocus`: on the web that scrolls the box the composer's form is still growing in.
  useEffect(() => {
    if (isTitleFocused) {
      focusField(titleRef.current);
    }
  }, [isTitleFocused]);
  return (
    <View
      className="gap-4"
      onTouchStart={() => {
        setPanel(null);
        setIsFinalOpen(false);
      }}
    >
      <TextField
        error={isTitleTouched && values.title.trim() === "" ? t("edit.titleRequired") : null}
        label={t("edit.taskTitle")}
        onChangeText={(title) => {
          setIsTitleTouched(true);
          onChange({ title });
        }}
        onSubmitEditing={onSubmit}
        ref={titleRef}
        returnKeyType={onSubmit === undefined ? "default" : "done"}
        submitBehavior={onSubmit === undefined ? "blurAndSubmit" : "submit"}
        value={values.title}
      />
      <ChoiceFields onChange={onChange} options={options} values={values} />
      <WhenFields
        fallback={options.estimates[values.presetId] ?? null}
        onChange={onChange}
        onClose={() => {
          setPanel(null);
        }}
        panel={panel}
        setPanel={setPanel}
        values={values}
      />
      <DueBeforeStartNote isStartChosen={isStartChosen} values={values} />
      <DeadlineAndRepeat
        isFinalOpen={isFinalOpen}
        onChange={onChange}
        onFinalOpenChange={setIsFinalOpen}
        repeatProblem={repeatProblem}
        showDeadlineIssue={showDeadlineIssue}
        values={values}
      />
      <TaskTextFields onChange={onChange} values={values} />
    </View>
  );
};
