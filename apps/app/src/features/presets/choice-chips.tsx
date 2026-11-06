import type { ProjectColorName } from "@pace/core";

import { Chip } from "#app/ui/chip.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";

/** A short list picked with one tap: the chosen value is the filled chip. */
export const ChoiceChips = <T extends number | string>({
  colorOf,
  label,
  labelOf,
  onChange,
  value,
  values,
}: {
  readonly label: string;
  readonly values: readonly T[];
  readonly value: T;
  readonly labelOf: (value: T) => string;
  readonly colorOf?: (value: T) => ProjectColorName;
  readonly onChange: (value: T) => void;
}) => (
  <RadioGroup
    className="flex-row flex-wrap gap-x-2"
    label={label}
    onChange={(option: T) => {
      onChange(option);
    }}
    value={value}
    values={values}
  >
    {values.map((option) => (
      <Chip hue={colorOf?.(option) ?? null} key={option} value={option}>
        {labelOf(option)}
      </Chip>
    ))}
  </RadioGroup>
);
