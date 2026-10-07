import { useId } from "react";

import { useT } from "#web/i18n.tsx";

type Props = {
  readonly description: string;
  readonly subtasks: string;
  readonly onChange: (next: { readonly description?: string; readonly subtasks?: string }) => void;
};

const AREA =
  "min-h-16 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-accent/40";

/** The composer's "More": a description and subtasks typed one per line. */
export const ExpandedFields = ({ description, onChange, subtasks }: Props) => {
  const t = useT();
  const descriptionId = useId();
  const subtasksId = useId();
  return (
    <div className="grid gap-2 px-1 pb-1 sm:grid-cols-2">
      <div className="grid gap-1">
        <label className="text-xs text-muted" htmlFor={descriptionId}>
          {t("composer.description")}
        </label>
        <textarea
          className={AREA}
          id={descriptionId}
          onChange={(event) => {
            onChange({ description: event.target.value });
          }}
          value={description}
        />
      </div>
      <div className="grid gap-1">
        <label className="text-xs text-muted" htmlFor={subtasksId}>
          {t("composer.subtasks")}
        </label>
        <textarea
          className={AREA}
          id={subtasksId}
          onChange={(event) => {
            onChange({ subtasks: event.target.value });
          }}
          value={subtasks}
        />
      </div>
    </div>
  );
};
