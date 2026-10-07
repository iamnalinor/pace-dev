import { cn } from "#web/shared/lib/cn.ts";

export type SegmentedOption<V extends string> = { readonly value: V; readonly label: string };

type Props<V extends string> = {
  readonly label: string;
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly className?: string;
};

/** A radio group drawn as one pill-shaped track with the chosen segment raised. */
export const SegmentedControl = <V extends string>({
  className,
  label,
  onChange,
  options,
  value,
}: Props<V>) => (
  <div
    aria-label={label}
    className={cn("flex gap-1 rounded-md bg-raised p-1", className)}
    role="radiogroup"
  >
    {options.map((option) => {
      const isActive = option.value === value;
      return (
        <button
          aria-checked={isActive}
          className={cn(
            "h-9 flex-1 rounded-sm px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
            isActive ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
          key={option.value}
          onClick={() => {
            onChange(option.value);
          }}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
