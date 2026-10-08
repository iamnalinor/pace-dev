import { useState } from "react";
import { Text, View } from "react-native";

import type { ActionResult } from "@pace/client";
import type { ProjectColorName } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { errorText } from "#app/format/action-error.ts";
import { Button } from "#app/ui/button.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import { ColorSwatches } from "./color-swatches.tsx";

export type ProjectFormValues = {
  readonly name: string;
  readonly color: ProjectColorName;
  /** `undefined` hides the field (a new project has none yet). */
  readonly description?: string;
};

/** Name, color (and description when editing), then Cancel / Save; refusals show inline. */
export const ProjectForm = ({
  extra,
  initial,
  onCancel,
  onSave,
  submitLabel,
}: {
  readonly initial: ProjectFormValues;
  readonly submitLabel: string;
  readonly onSave: (values: ProjectFormValues) => ActionResult;
  readonly onCancel: () => void;
  /** Under the fields, left of the buttons (archive / restore). */
  readonly extra?: React.ReactNode;
}) => {
  const t = useT();
  const [values, setValues] = useState(initial);
  const [problem, setProblem] = useState<null | string>(null);
  const save = async (): Promise<void> => {
    const result = await onSave(values);
    setProblem(result.ok ? null : errorText(t, result.error));
  };
  return (
    <View className="gap-3 rounded-xl border border-line bg-surface p-3.5">
      <TextField
        label={t("projects.name")}
        onChangeText={(name) => {
          setValues({ ...values, name });
        }}
        onSubmitEditing={() => void save()}
        value={values.name}
      />
      <ColorSwatches
        label={t("projects.color")}
        onChange={(color) => {
          setValues({ ...values, color });
        }}
        value={values.color}
      />
      {values.description === undefined ? null : (
        <TextField
          label={t("project.description")}
          multiline
          onChangeText={(description) => {
            setValues({ ...values, description });
          }}
          value={values.description}
        />
      )}
      {problem === null ? null : (
        <Text accessibilityRole="alert" className="font-sans text-[14px] text-warn">
          {problem}
        </Text>
      )}
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        {extra === undefined ? null : <View className="mr-auto">{extra}</View>}
        <Button onPress={onCancel} variant="ghost">
          {t("common.cancel")}
        </Button>
        <Button onPress={() => void save()}>{submitLabel}</Button>
      </View>
    </View>
  );
};
