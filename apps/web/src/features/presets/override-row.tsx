import { type ReactNode, useId } from "react";

import { useT } from "#web/i18n.tsx";

export type RowState = {
  /** For the row's main control, so the row label names it. */
  readonly id: string;
  /** Not overridden: the control shows the inherited value and cannot be changed. */
  readonly disabled: boolean;
  readonly invalid: boolean;
};

type Props = {
  readonly label: string;
  readonly isOverridden: boolean;
  readonly onToggle: () => void;
  /** Whom the value is inherited from, shown while the row is not overridden. */
  readonly parentName: string;
  readonly invalid?: boolean;
  /** `false` when the main control has its own label (a checkbox): the row label then only names the group. */
  readonly labelsControl?: boolean;
  readonly children: (state: RowState) => ReactNode;
};

/**
One setting of a preset: its label, an "override" switch, and the control. Until the switch
is on the control shows what the parent chain gives and nothing is stored for it.
*/
export const OverrideRow = ({
  children,
  invalid = false,
  isOverridden,
  label,
  labelsControl = true,
  onToggle,
  parentName,
}: Props) => {
  const t = useT();
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <div
      aria-labelledby={labelId}
      className="grid gap-2 border-t border-line py-3 first:border-t-0"
      role="group"
    >
      <div className="flex items-center justify-between gap-3">
        {labelsControl ? (
          <label className="text-sm text-fg2" htmlFor={id} id={labelId}>
            {label}
          </label>
        ) : (
          <span className="text-sm text-fg2" id={labelId}>
            {label}
          </span>
        )}
        <label className="flex min-h-11 shrink-0 items-center gap-2 px-1 text-xs text-muted">
          <input
            aria-label={t("presets.override", { field: label })}
            checked={isOverridden}
            className="size-4 accent-accent"
            onChange={onToggle}
            type="checkbox"
          />
          {t("presets.overrideShort")}
        </label>
      </div>
      {children({ disabled: !isOverridden, id, invalid })}
      {!isOverridden && (
        <p className="text-xs text-faint">{t("presets.inherited", { from: parentName })}</p>
      )}
      {invalid && <p className="text-xs text-warn">{t("presets.checkValue")}</p>}
    </div>
  );
};
