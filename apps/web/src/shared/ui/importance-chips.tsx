import { useT } from "#web/i18n.tsx";
import { type Importance, IMPORTANCE_COLORS, ImportanceSchema } from "@pace/core";

import { ChipGroup } from "./chip-group.tsx";

type Props = {
  readonly value: Importance;
  readonly onChange: (importance: Importance) => void;
  readonly className?: string | undefined;
};

/** The four importances as one-tap chips, each with its colour. */
export const ImportanceChips = ({ className, onChange, value }: Props) => {
  const t = useT();
  return (
    <ChipGroup
      className={className}
      label={t("edit.importance")}
      onChange={onChange}
      options={ImportanceSchema.options.map((importance) => ({
        color: IMPORTANCE_COLORS[importance],
        label: t(`importance.${importance}`),
        value: importance,
      }))}
      value={value}
    />
  );
};
