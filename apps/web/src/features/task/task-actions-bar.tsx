import { Check, Clock, Play, RotateCcw, Square, Upload } from "lucide-react";

import type { TaskViewModel } from "@pace/client";

import { useLanguage, useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatList } from "#web/shared/format/number.ts";
import { useRunAction } from "#web/shared/lib/use-run-action.ts";
import { Button } from "#web/shared/ui/button.tsx";

import type { CloseMode } from "./close-sheet.tsx";

import { problemName } from "./close-preview.ts";

const BUTTON = "h-12 rounded-lg text-sm";

type Props = {
  readonly view: TaskViewModel;
  readonly onClose: (mode: CloseMode) => void;
};

/** A closed task: how it ended, and Reopen. */
const ClosedBar = ({ view }: { readonly view: TaskViewModel }) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const closed = view.closed;
  if (closed === null) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-6">
      <p className="text-center text-[13px] text-muted">
        {t("task.closedAs", { outcome: t(`outcome.${view.outcome ?? closed.outcome}`) })}
        {closed.reason !== null && ` · ${t("task.reason", { reason: closed.reason })}`}
      </p>
      <Button
        className={BUTTON}
        onClick={() => {
          void run(actions.reopen(view.id), { undo: t("task.reopened") });
        }}
        variant="secondary"
      >
        <RotateCcw aria-hidden="true" strokeWidth={1.75} />
        {t("task.reopen")}
      </Button>
    </div>
  );
};

/** The primary button: Submit the solved problems, Done, or Close. */
const usePrimary = (view: TaskViewModel) => {
  const t = useT();
  const language = useLanguage();
  const { primaryAction } = view;
  return (() => {
    switch (primaryAction.kind) {
      case "submit": {
        const names = view.problems
          .filter((problem) => primaryAction.subtaskIds.includes(problem.id))
          .map((problem) => problemName(problem));
        return {
          icon: <Upload aria-hidden="true" strokeWidth={1.75} />,
          label: t("task.submitProblems", { problems: formatList(names, language) }),
          mode: "submit" as const,
        };
      }
      case "done": {
        return {
          icon: <Check aria-hidden="true" strokeWidth={1.75} />,
          label: t("task.done"),
          mode: "done" as const,
        };
      }
      case "none": {
        return {
          icon: <Check aria-hidden="true" strokeWidth={1.75} />,
          label: t("close.closeTitle"),
          mode: "close" as const,
        };
      }
    }
  })();
};

/** Focus (time on this task, from the time bar's ledger), the status switch, and the primary action: Submit, Done or Reopen. */
export const TaskActionsBar = ({ onClose, view }: Props) => {
  const t = useT();
  const { actions } = useServices();
  const run = useRunAction();
  const primary = usePrimary(view);
  const running = useServices().hooks.useTimeBar().running;
  const isFocused = running?.taskId === view.id;
  if (view.closed !== null) {
    return <ClosedBar view={view} />;
  }

  const status = view.tags.find((tag) => tag.kind === "status");
  const isOnHold =
    status?.kind === "status" && (status.status === "waiting" || status.status === "paused");
  const setStatus = (next: "in_progress" | "waiting"): void => {
    void run(actions.setStatus(view.id, next), {
      undo: t("task.statusSet", { status: t(`status.${next}`), title: view.title }),
    });
  };

  return (
    <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 px-4 pt-3 pb-6">
      <Button
        aria-pressed={isFocused}
        className={BUTTON}
        onClick={() => {
          void run(isFocused ? actions.stopActivity() : actions.focusTask(view.id), {
            undo: t(isFocused ? "time.stopped" : "time.started", { label: view.title }),
          });
        }}
        variant={isFocused ? "accent" : "secondary"}
      >
        {isFocused ? (
          <Square aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <Play aria-hidden="true" strokeWidth={1.75} />
        )}
        {t(isFocused ? "time.focusing" : "task.focus")}
      </Button>
      {isOnHold ? (
        <Button
          className={BUTTON}
          onClick={() => {
            setStatus("in_progress");
          }}
          variant="secondary"
        >
          <Play aria-hidden="true" strokeWidth={1.75} />
          {t("task.resume")}
        </Button>
      ) : (
        <Button
          className={BUTTON}
          onClick={() => {
            setStatus("waiting");
          }}
          variant="secondary"
        >
          <Clock aria-hidden="true" strokeWidth={1.75} />
          {t("task.waiting")}
        </Button>
      )}
      <Button
        className={`${BUTTON} font-semibold`}
        onClick={() => {
          onClose(primary.mode);
        }}
        variant="accent"
      >
        {primary.icon}
        <span className="truncate">{primary.label}</span>
      </Button>
    </div>
  );
};
