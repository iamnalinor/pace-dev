import { useT } from "#app/app-state.tsx";
import { TaskRows } from "#app/shared/task-list.tsx";
import { groupNowRows, type NowRow } from "@pace/client";

/**
One plain list: the tasks with a deadline in their order, a hairline, then the tasks without one.
No headers, no folds; the hairline is a separator that names what starts below it. With only one
kind there is no hairline.
*/
export const NowTaskGroups = ({ rows }: { readonly rows: readonly NowRow[] }) => {
  const t = useT();
  const { dated, undated } = groupNowRows(rows);
  const undatedIds = new Set(undated.map((row) => row.id));
  return (
    <TaskRows
      animateLayout={false}
      boundary={{ isAfter: (row) => undatedIds.has(row.id), label: t("now.withoutDeadline") }}
      label={t("now.tasks")}
      rows={[...dated, ...undated]}
    />
  );
};
