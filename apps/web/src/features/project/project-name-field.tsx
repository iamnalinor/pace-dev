import { useT } from "#web/i18n.tsx";
import { cn } from "#web/shared/lib/cn.ts";

import { FIELD_CLASS } from "./field-class.ts";

/** The project's name, as typed. */
export const ProjectNameField = ({
  id,
  onChange,
  value,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (name: string) => void;
}) => {
  const t = useT();
  return (
    <label className="grid gap-1 text-sm text-fg2" htmlFor={id}>
      {t("projects.name")}
      <input
        className={cn(FIELD_CLASS, "h-11")}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      />
    </label>
  );
};
