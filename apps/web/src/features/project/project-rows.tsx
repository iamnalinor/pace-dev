import { Link } from "react-router";

import type { AwaitingRow, DoneRow, NowRow } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatDateTime, formatDue, type Viewer } from "#web/shared/format/time.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { TaskRow } from "#web/shared/task/task-row.tsx";
import { useCompleteTask } from "#web/shared/task/use-complete-task.ts";

const ROW_CLASS = "flex min-h-[52px] items-center gap-3 border-b border-line px-1 py-2";

const useViewer = (): Viewer => {
  const language = useLanguage();
  const { deviceTz, now } = useServices().hooks.useClock();
  return { deviceTz, language, now };
};

/** An open task, drawn as on Now; its check circle completes it the same way. */
export const OpenTaskRow = ({ row }: { readonly row: NowRow }) => {
  const complete = useCompleteTask();
  return (
    <TaskRow
      className="rounded-none border-b border-line px-1"
      onCheck={(target) => {
        void complete(target);
      }}
      row={row}
    />
  );
};

/** An empty recurring instance: its due, and the way to the task page to add problems. */
export const AwaitingTaskRow = ({ row }: { readonly row: AwaitingRow }) => {
  const t = useT();
  const viewer = useViewer();
  return (
    <li className={ROW_CLASS}>
      <span
        aria-hidden="true"
        className="size-[22px] shrink-0 rounded-full border-[1.5px] border-dashed border-muted"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-fg2">{row.title}</p>
        {row.dueAt !== null && row.dueTz !== null && (
          <p className="text-xs text-muted">
            {formatDue({ at: row.dueAt, tz: row.dueTz }, viewer)}
          </p>
        )}
      </div>
      <Link
        aria-label={t("project.addProblemsTo", { title: row.title })}
        className="flex h-11 items-center rounded-md px-3 text-sm text-accentText hover:underline"
        to={`/task/${row.id}`}
      >
        {t("project.addProblems")}
      </Link>
    </li>
  );
};

const LATE = new Set(["cancelled_missed", "done_late"]);

/** A closed task: its outcome and the day it closed. */
export const DoneTaskRow = ({ row }: { readonly row: DoneRow }) => {
  const t = useT();
  const viewer = useViewer();
  return (
    <li className={cn(ROW_CLASS, "text-muted")}>
      <span aria-hidden="true" className="size-[22px] shrink-0 rounded-full bg-track" />
      <Link className="min-w-0 flex-1 truncate text-sm text-fg2" to={`/task/${row.id}`}>
        {row.title}
      </Link>
      <span className="text-xs">
        <span className={cn(LATE.has(row.outcome) && "text-warn")}>
          {t(`outcome.${row.outcome}`)}
        </span>
        {row.closedAt !== null &&
          ` · ${formatDateTime(row.closedAt, viewer.deviceTz, viewer.language)}`}
      </span>
    </li>
  );
};
