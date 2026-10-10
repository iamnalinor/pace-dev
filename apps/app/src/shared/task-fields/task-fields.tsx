import { useState } from "react";
import { View } from "react-native";

import type { ComposerOption } from "@pace/client";

import { useLanguage, useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { type Importance, IMPORTANCE_COLORS, ImportanceSchema, presetLabel } from "@pace/core";

import { DateChip, DatePanel, type Zoned } from "./date-field.tsx";
import { EstimateChip, EstimateOptions } from "./estimate-field.tsx";
import { OptionRow } from "./option-row.tsx";

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
  values,
}: {
  readonly values: TaskFormValues;
  /** The category's estimate, used while the task has none of its own. */
  readonly fallback: null | number;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (next: Exclude<Panel, null>): void => {
    setPanel(panel === next ? null : next);
  };
  const close = (): void => {
    setPanel(null);
  };
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-1.5">
        <DateChip
          isOpen={panel === "start"}
          kind="start"
          onToggle={() => {
            toggle("start");
          }}
          value={values.start}
        />
        <DateChip
          isOpen={panel === "due"}
          kind="due"
          onToggle={() => {
            toggle("due");
          }}
          value={values.due}
        />
        <EstimateChip
          fallback={fallback}
          isOpen={panel === "estimate"}
          minutes={values.estimateMinutes}
          onToggle={() => {
            toggle("estimate");
          }}
        />
      </View>
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
  onChange,
  options,
  values,
}: {
  readonly values: TaskFormValues;
  readonly options: TaskFormOptions;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
}) => {
  const t = useT();
  return (
    <View className="gap-3.5">
      <TextField
        error={values.title.trim() === "" ? t("edit.titleRequired") : null}
        label={t("edit.taskTitle")}
        onChangeText={(title) => {
          onChange({ title });
        }}
        value={values.title}
      />
      <ChoiceFields onChange={onChange} options={options} values={values} />
      <WhenFields
        fallback={options.estimates[values.presetId] ?? null}
        onChange={onChange}
        values={values}
      />
      <TextField
        label={t("edit.description")}
        multiline
        onChangeText={(description) => {
          onChange({ description });
        }}
        value={values.description}
      />
      <TextField
        autoCapitalize="none"
        inputMode="url"
        label={t("edit.link")}
        onChangeText={(link) => {
          onChange({ link });
        }}
        placeholder="https://"
        value={values.link}
      />
    </View>
  );
};
