import { useEffect, useRef, useState } from "react";
import { Text, type TextInput, View } from "react-native";

import type { ComposerOption } from "@pace/client";

import { useLanguage, useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import {
  type DeadlinePolicy,
  type Importance,
  IMPORTANCE_COLORS,
  ImportanceSchema,
  presetLabel,
  type SeriesSchedule,
} from "@pace/core";

import { DatePanel, type Zoned } from "./date-field.tsx";
import { isDeadlineChoiceValid } from "./deadline-choice.ts";
import { DeadlinePolicyField } from "./deadline-policy-field.tsx";
import { EstimateOptions } from "./estimate-field.tsx";
import { OptionRow } from "./option-row.tsx";
import { RecurrenceField } from "./recurrence-field.tsx";
import { TaskTextFields } from "./task-text-fields.tsx";
import { useOutsidePress } from "./use-outside-press.ts";
import { WhenChips } from "./when-chips.tsx";

/** Everything a task form shows, as plain values: the composer's and the editor's alike. */
export type TaskFormValues = {
  readonly title: string;
  readonly presetId: string;
  readonly projectId: null | string;
  /** A project to create on save (the assistant or a `#tag` named one that does not exist). */
  readonly newProjectName: null | string;
  readonly importance: Importance;
  readonly start: Zoned;
  readonly due: Zoned;
  readonly estimateMinutes: null | number;
  readonly deadlinePolicy: DeadlinePolicy;
  readonly recurrence: null | SeriesSchedule;
  readonly description: string;
  readonly link: string;
};

export type TaskFormOptions = {
  readonly presets: readonly ComposerOption[];
  readonly projects: readonly ComposerOption[];
  /** Each category's own estimate, shown when the task has none of its own. */
  readonly estimates: Readonly<Record<string, number>>;
};

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
            color={IMPORTANCE_COLORS[importance]}
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
}) => {
  const t = useT();
  const titleRef = useRef<TextInput>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [isFinalOpen, setIsFinalOpen] = useState(false);
  // Not `autoFocus`: on the web that scrolls the box the composer's form is still growing in.
  useEffect(() => {
    if (isTitleFocused) {
      focusField(titleRef.current);
    }
  }, [isTitleFocused]);
  return (
    <View
      className="gap-3.5"
      onTouchStart={() => {
        setPanel(null);
        setIsFinalOpen(false);
      }}
    >
      <TextField
        error={values.title.trim() === "" ? t("edit.titleRequired") : null}
        label={t("edit.taskTitle")}
        onChangeText={(title) => {
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
      <DeadlinePolicyField
        isFinalOpen={isFinalOpen}
        onChange={(deadlinePolicy) => {
          onChange({ deadlinePolicy });
        }}
        onFinalOpenChange={setIsFinalOpen}
        value={values.deadlinePolicy}
      />
      <RecurrenceField
        onChange={(recurrence) => {
          onChange({ recurrence });
        }}
        start={values.start}
        value={values.recurrence}
      />
      {showDeadlineIssue && !isDeadlineChoiceValid(values.deadlinePolicy, values.due) ? (
        <Text className="font-sans text-[12px] text-warn">{t("form.deadlineInvalid")}</Text>
      ) : null}
      <TaskTextFields onChange={onChange} values={values} />
    </View>
  );
};
