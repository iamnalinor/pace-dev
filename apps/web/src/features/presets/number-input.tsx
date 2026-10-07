import { useState } from "react";

import { cn } from "#web/shared/lib/cn.ts";

import { CONTROL_CLASS } from "./control-class.ts";

type Props = {
  readonly id: string;
  /** `undefined` shows the placeholder (the inherited value). */
  readonly value: number | undefined;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly onChange: (value: number) => void;
};

/**
A number the person types freely: the text is kept as typed and every parseable value is
passed on, so a half-typed `0.` never jumps back. Re-mount it (a new `key`) to reset it.
*/
export const NumberInput = ({ disabled, id, invalid, onChange, placeholder, value }: Props) => {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <input
      aria-invalid={invalid}
      className={cn(CONTROL_CLASS, "font-mono")}
      disabled={disabled}
      id={id}
      inputMode="decimal"
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed)) {
          onChange(parsed);
        }
      }}
      placeholder={placeholder}
      step="any"
      type="number"
      value={text}
    />
  );
};
