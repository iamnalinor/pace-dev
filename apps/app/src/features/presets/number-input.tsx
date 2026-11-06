import { useState } from "react";

import { TextField } from "#app/ui/text-field.tsx";

/**
A number the person types freely: the text is kept as typed and every parseable value is
passed on, so a half-typed `0.` never jumps back. Re-mount it (a new `key`) to reset it.
*/
export const NumberInput = ({
  invalid = false,
  label,
  onChange,
  placeholder,
  value,
}: {
  readonly label: string;
  /** `undefined` shows the placeholder (the inherited value). */
  readonly value: number | undefined;
  readonly placeholder: string;
  readonly invalid?: boolean;
  readonly onChange: (value: number) => void;
}) => {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <TextField
      isInvalid={invalid}
      isLabelHidden
      label={label}
      onChangeText={(next) => {
        setText(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed)) {
          onChange(parsed);
        }
      }}
      placeholder={placeholder}
      purpose="number"
      value={text}
    />
  );
};
