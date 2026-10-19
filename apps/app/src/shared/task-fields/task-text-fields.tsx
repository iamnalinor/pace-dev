import { useT } from "#app/app-state.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import type { TaskFormValues } from "./task-form-types.ts";

/** The freeform text at the end of both task forms. */
export const TaskTextFields = ({
  onChange,
  values,
}: {
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  readonly values: TaskFormValues;
}) => {
  const t = useT();
  return (
    <>
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
    </>
  );
};
