import { useId } from "react";

import { useT } from "#web/i18n.tsx";
import { ChipGroup } from "#web/shared/ui/chip-group.tsx";
import { ACTIVITY_CATEGORIES, type ActivityCategory, CATEGORY_COLORS } from "@pace/core";

/** A labelled mono input for times and minutes, with an optional hint under it. */
export const MonoField = ({
  hint,
  label,
  onChange,
  type,
  value,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly type: "datetime-local" | "number";
  readonly value: string;
  readonly onChange: (value: string) => void;
}) => {
  const id = useId();
  return (
    <label className="grid gap-1 text-xs text-muted" htmlFor={id}>
      {label}
      <input
        {...(hint !== undefined && { "aria-describedby": `${id}-hint` })}
        className="h-10 rounded-md border border-line bg-surface px-3 font-mono text-sm text-fg"
        id={id}
        {...(type === "number" && { inputMode: "numeric" as const, min: 1 })}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        type={type}
        value={value}
      />
      {hint !== undefined && <span id={`${id}-hint`}>{hint}</span>}
    </label>
  );
};

/** The activity categories as one-tap chips in their colors. */
export const CategoryChips = ({
  onChange,
  value,
}: {
  readonly value: ActivityCategory;
  readonly onChange: (category: ActivityCategory) => void;
}) => {
  const t = useT();
  return (
    <ChipGroup
      label={t("editor.category")}
      onChange={onChange}
      options={ACTIVITY_CATEGORIES.map((category) => ({
        color: CATEGORY_COLORS[category],
        label: t(`category.${category}`),
        value: category,
      }))}
      value={value}
    />
  );
};
