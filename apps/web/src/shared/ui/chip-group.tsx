import type { ProjectColorName } from "@pace/core";

import { cn } from "#web/shared/lib/cn.ts";

import { colorChipClass } from "./color-tag.tsx";

export type ChipOption<V extends string> = {
  readonly value: V;
  readonly label: string;
  /** The chip is drawn in this colour (a category's, a project's, an importance's). */
  readonly color?: null | ProjectColorName | undefined;
};

type Props<V extends string> = {
  readonly label: string;
  readonly options: readonly ChipOption<V>[];
  readonly value: null | V;
  readonly onChange: (value: V) => void;
  readonly className?: string | undefined;
};

const CHIP_BASE =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-accent/40";

/** A chip; with a colour it is washed in it, and filled with it once chosen. */
export const chipClass = (isChecked: boolean, color: null | ProjectColorName = null): string =>
  cn(
    CHIP_BASE,
    color !== null && colorChipClass(color, isChecked),
    color === null &&
      (isChecked
        ? "border-inverse bg-inverse font-medium text-inverseFg"
        : "border-line text-fg2 hover:bg-raised"),
  );

/** One tap picks: a compact row of chips that acts as a radio group. */
export const ChipGroup = <V extends string>({
  className,
  label,
  onChange,
  options,
  value,
}: Props<V>) => (
  <div aria-label={label} className={cn("flex flex-wrap gap-1.5", className)} role="radiogroup">
    {options.map((option) => (
      <button
        aria-checked={option.value === value}
        className={chipClass(option.value === value, option.color ?? null)}
        key={option.value}
        onClick={() => {
          onChange(option.value);
        }}
        role="radio"
        type="button"
      >
        {option.label}
      </button>
    ))}
  </div>
);
