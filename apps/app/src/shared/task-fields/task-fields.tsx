import { useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import type { RepeatChangeProblem } from "@pace/client";

import { useIsAccountUnknown, useLanguage, useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { IMPORTANCE_HUES } from "#app/ui/color.tsx";
import { KnownAfterSync } from "#app/ui/empty-state.tsx";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { ImportanceSchema, presetLabel } from "@pace/core";

import type { TaskFormOptions, TaskFormValues } from "./task-form-types.ts";

import { DatePanel } from "./date-field.tsx";
import { DeadlineAndRepeat, DueBeforeStartNote } from "./deadline-and-repeat.tsx";
import { EstimateOptions } from "./estimate-field.tsx";
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

/** The project row's choices besides the projects: none, and a new one the assistant proposed. */
const NO_PROJECT = "project:none";
const NEW_PROJECT = "project:new";

/**
Category, importance and project as one-tap rows, each one tab stop with arrows (`RadioChips`,
round 7 review 10's sweep).
*/
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
      <RadioChips
        choices={options.presets.map((preset) => ({
          color: preset.color,
          text: presetLabel(preset, language),
          value: preset.id,
        }))}
        label={t("composer.category")}
        onChange={(presetId) => {
          onChange({ presetId });
        }}
        value={values.presetId}
      />
      <RadioChips
        choices={ImportanceSchema.options.map((importance) => ({
          color: IMPORTANCE_HUES[importance],
          text: t(`importance.${importance}`),
          value: importance,
        }))}
        label={t("edit.importance")}
        onChange={(importance) => {
          onChange({ importance });
        }}
        value={values.importance}
      />
      <RadioChips
        choices={[
          { text: t("composer.noProject"), value: NO_PROJECT },
          ...(values.newProjectName === null
            ? []
            : [
                {
                  text: t("composer.newProject", { name: values.newProjectName }),
                  value: NEW_PROJECT,
                },
              ]),
          ...options.projects.map((project) => ({
            color: project.color,
            label: t("composer.projectNamed", { name: project.name }),
            text: project.name,
            value: project.id,
          })),
        ]}
        label={t("composer.project")}
        onChange={(choice) => {
          // The project the assistant proposed stays chosen until another is picked.
          if (choice !== NEW_PROJECT) {
            onChange({ newProjectName: null, projectId: choice === NO_PROJECT ? null : choice });
          }
        }}
        value={values.projectId ?? (values.newProjectName === null ? NO_PROJECT : NEW_PROJECT)}
      />
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
  // The categories, their estimates and the projects are the account's: until a sync of this
  // session succeeded, the built-in ones are not drawn as its own (/add during a first sync, class 62).
  const isUnknown = useIsAccountUnknown();
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
      <KnownAfterSync>
        <ChoiceFields onChange={onChange} options={options} values={values} />
      </KnownAfterSync>
      <WhenFields
        fallback={isUnknown ? null : (options.estimates[values.presetId] ?? null)}
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
