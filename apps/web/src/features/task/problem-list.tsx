import { Check } from "lucide-react";

import type { ProblemRow, TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { cn } from "#web/shared/lib/cn.ts";
import { formatRelativeDay } from "@pace/core";

const BOX =
  "relative flex size-6 shrink-0 items-center justify-center rounded-[7px] after:absolute after:-inset-2.5";
const TOGGLE = `${BOX} outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40`;

type RowProps = {
  readonly problem: ProblemRow;
  readonly isClosed: boolean;
  readonly onToggle: (problem: ProblemRow) => void;
};

/** One problem: number, label, its state in words and the solved box. */
const ProblemItem = ({ isClosed, onToggle, problem }: RowProps) => {
  const t = useT();
  const language = useLanguage();
  const { deviceTz, now } = useServices().hooks.useClock();
  const toggle = () => {
    onToggle(problem);
  };
  return (
    <li className="flex h-[46px] items-center gap-2.5 px-2">
      <span className="w-[26px] font-mono text-muted">{problem.number ?? ""}</span>
      <span
        className={cn("min-w-0 flex-1 truncate text-sm", problem.state === "pending" && "text-fg2")}
      >
        {problem.label}
      </span>
      {problem.state === "submitted" && (
        <>
          <span className="text-[11px] text-faint">
            {t("task.problemSent", {
              when: formatRelativeDay(problem.submittedAt ?? now, now, { language, tz: deviceTz }),
            })}
          </span>
          <span
            aria-label={t("task.problemSentLabel")}
            className={cn(BOX, "bg-inverse text-inverseFg")}
            role="img"
          >
            <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </span>
        </>
      )}
      {problem.state === "solved" && (
        <>
          <span className="text-[11px] text-fg2">{t("task.problemSolved")}</span>
          <button
            aria-label={t("task.unmarkSolved", { label: problem.label })}
            className={cn(TOGGLE, "border-[1.5px] border-fg text-fg")}
            disabled={isClosed}
            onClick={toggle}
            type="button"
          >
            <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />
          </button>
        </>
      )}
      {problem.state === "pending" && (
        <button
          aria-label={t("task.markSolved", { label: problem.label })}
          className={cn(TOGGLE, "border-[1.5px] border-muted hover:border-fg")}
          disabled={isClosed}
          onClick={toggle}
          type="button"
        />
      )}
    </li>
  );
};

/** The problems of a per-problem task; tapping a box marks it solved or takes that back. */
export const ProblemList = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const solved = view.problems.filter((problem) => problem.state !== "pending").length;
  const sent = view.problems.filter((problem) => problem.state === "submitted").length;
  const toggle = (problem: ProblemRow): void => {
    void run(
      problem.state === "solved"
        ? actions.unmarkSolved(view.id, problem.id)
        : actions.markSolved(view.id, problem.id),
    );
  };
  return (
    <section aria-labelledby="problems-title">
      <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2">
        <h2 className="text-[13px] font-medium text-muted" id="problems-title">
          {t("task.problems")}
        </h2>
        <span className="font-mono text-xs text-muted">
          {t("task.problemsSummary", { sent, solved })}
        </span>
      </div>
      <ul className="flex flex-col px-3">
        {view.problems.map((problem) => (
          <ProblemItem
            isClosed={view.closed !== null}
            key={problem.id}
            onToggle={toggle}
            problem={problem}
          />
        ))}
      </ul>
    </section>
  );
};
