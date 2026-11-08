import { useT } from "#app/app-state.tsx";
import { TextField } from "#app/ui/text-field.tsx";

import type { TaskFormValues } from "./task-form-types.ts";

/** A field's draft key under its form's (`task.<id>.title`); none when the form keeps none. */
export const fieldDraftKey = (form: string | undefined, field: string): string | undefined =>
  form === undefined ? undefined : `${form}.${field}`;

/** The freeform text at the end of both task forms. */
export const TaskTextFields = ({
  draftKey,
  onChange,
  values,
}: {
  /** The form's draft key: each field keeps its text under its own name beneath it. */
  readonly draftKey?: string | undefined;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  readonly values: TaskFormValues;
}) => {
  const t = useT();
  return (
    <>
      <TextField
        draftKey={fieldDraftKey(draftKey, "description")}
        label={t("edit.description")}
        multiline
        onChangeText={(description) => {
          onChange({ description });
        }}
        value={values.description}
      />
      <TextField
        autoCapitalize="none"
        draftKey={fieldDraftKey(draftKey, "link")}
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
