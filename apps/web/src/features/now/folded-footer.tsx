import { useState } from "react";

import type { NowRow } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { TaskRow } from "#web/shared/task/task-row.tsx";

type Props = {
  readonly laterCount: number;
  readonly waiting: readonly NowRow[];
  readonly onCheck: (row: NowRow) => void;
};

/** "+ 6 later · 2 waiting" under the board; tapping it unfolds the waiting tasks. */
export const FoldedFooter = ({ laterCount, onCheck, waiting }: Props) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const label = [
    ...(laterCount > 0 ? [t("now.later", { count: laterCount })] : []),
    ...(waiting.length > 0 ? [t("now.waitingCount", { count: waiting.length })] : []),
  ].join(" · ");
  if (label === "") {
    return null;
  }
  if (waiting.length === 0) {
    return <p className="px-5 pt-1 text-xs text-faint">{label}</p>;
  }
  return (
    <>
      <button
        aria-controls="now-waiting"
        aria-expanded={isOpen}
        className="mx-2 flex min-h-11 items-center self-start rounded-md px-3 text-xs text-faint transition-colors outline-none hover:text-fg2 focus-visible:ring-[3px] focus-visible:ring-accent/40"
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        {label}
      </button>
      {isOpen && (
        <section aria-labelledby="now-waiting-title" className="pt-1" id="now-waiting">
          <h2 className="px-5 pb-1 text-[13px] font-medium text-muted" id="now-waiting-title">
            {t("now.waiting")}
          </h2>
          <ul className="flex flex-col px-2">
            {waiting.map((row) => (
              <TaskRow key={row.id} onCheck={onCheck} row={row} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
};
