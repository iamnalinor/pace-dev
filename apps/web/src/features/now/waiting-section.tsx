import type { NowRow } from "@pace/client";

import { useT } from "#web/i18n.tsx";
import { TaskRow } from "#web/shared/task/task-row.tsx";

type Props = {
  readonly hasActive: boolean;
  readonly laterCount: number;
  readonly waiting: readonly NowRow[];
  readonly onCheck: (row: NowRow) => void;
};

/**
The waiting tasks, always listed under the board (set apart by a divider when both kinds are
there), then "+ 6 later" for what is not due to show yet.
*/
export const WaitingSection = ({ hasActive, laterCount, onCheck, waiting }: Props) => {
  const t = useT();
  return (
    <>
      {waiting.length > 0 && (
        <section aria-labelledby="now-waiting-title" className="pt-1">
          <h2
            className={
              hasActive
                ? "mx-5 mt-2 border-t border-line pt-3 pb-1 text-[13px] font-medium text-muted"
                : "sr-only"
            }
            id="now-waiting-title"
          >
            {t("now.waiting")}
          </h2>
          <ul className="flex flex-col px-4">
            {waiting.map((row) => (
              <TaskRow key={row.id} onCheck={onCheck} row={row} />
            ))}
          </ul>
        </section>
      )}
      {laterCount > 0 && (
        <p className="px-5 pt-1 text-xs text-faint">{t("now.later", { count: laterCount })}</p>
      )}
    </>
  );
};
