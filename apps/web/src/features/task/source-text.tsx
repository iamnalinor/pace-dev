import { useState } from "react";

import { useT } from "#web/i18n.tsx";

/** The message the task came from, shown exactly as it arrived (no translation, no reflow). */
export const SourceText = ({ text }: { readonly text: string }) => {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  return (
    <div className="px-5 pt-1.5">
      <button
        aria-controls="task-source"
        aria-expanded={isOpen}
        className="min-h-11 rounded-sm text-xs text-muted outline-none hover:text-fg focus-visible:ring-[3px] focus-visible:ring-accent/40"
        onClick={() => {
          setOpen((current) => !current);
        }}
        type="button"
      >
        {isOpen ? t("task.hideSource") : t("task.showSource")}
      </button>
      {isOpen && (
        <blockquote
          aria-label={t("task.sourceTitle")}
          className="rounded-xl border border-line bg-surface p-3.5 text-[13px] leading-normal whitespace-pre-wrap text-fg2"
          id="task-source"
        >
          {text}
        </blockquote>
      )}
    </div>
  );
};
