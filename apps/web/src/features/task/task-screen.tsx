import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import type { TaskViewModel } from "@pace/client";

import { useServices } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { actionErrorText } from "#web/shared/lib/action-error.ts";
import { CLOSE_SHEET_PARAM } from "#web/shared/task/use-complete-task.ts";
import { ZoneBanner } from "#web/shared/time/zone-banner.tsx";
import { Button } from "#web/shared/ui/button.tsx";

import { type CloseMode, CloseSheet } from "./close-sheet.tsx";
import { EditSheet } from "./edit-sheet.tsx";
import { ProblemList } from "./problem-list.tsx";
import { ProgressCard } from "./progress-card.tsx";
import { SourceText } from "./source-text.tsx";
import { TaskActionsBar } from "./task-actions-bar.tsx";
import { TaskHeader } from "./task-header.tsx";
import { TaskMenu } from "./task-menu.tsx";
import { TaskStats } from "./task-stats.tsx";
import { TaskSummary } from "./task-summary.tsx";

type Sheet = "close" | "edit" | "menu" | "move" | null;

/** The close sheet a check on Now asked for (`?close=1`), as the task's primary action allows. */
const requestedMode = (view: TaskViewModel): CloseMode => {
  switch (view.primaryAction.kind) {
    case "submit": {
      return "submit";
    }
    case "done": {
      return "done";
    }
    case "none": {
      return "close";
    }
  }
};

const TshouldAskDetails = ({ view }: { readonly view: TaskViewModel }) => {
  const [params, setParams] = useSearchParams();
  const isCloseRequested = params.has(CLOSE_SHEET_PARAM) && view.closed === null;
  const [sheet, setSheet] = useState<Sheet>(isCloseRequested ? "close" : null);
  const [closeMode, setCloseMode] = useState<CloseMode>(() => requestedMode(view));
  const closeSheet = (): void => {
    setSheet(null);
    if (params.has(CLOSE_SHEET_PARAM)) {
      setParams({}, { replace: true });
    }
  };
  return (
    <main className="flex flex-1 flex-col">
      <TaskHeader
        onMore={() => {
          setSheet("menu");
        }}
        onProject={() => {
          setSheet("move");
        }}
        project={view.project}
      />
      <ZoneBanner />
      <TaskSummary view={view} />
      {view.progress.mode === "slider" && <ProgressCard view={view} />}
      <TaskStats view={view} />
      {view.problems.length > 0 && <ProblemList view={view} />}
      {view.sourceText !== null && view.sourceText !== "" && <SourceText text={view.sourceText} />}
      <div className="flex-1" />
      <TaskActionsBar
        onClose={(mode) => {
          setCloseMode(mode);
          setSheet("close");
        }}
        view={view}
      />
      <CloseSheet
        isOpen={sheet === "close"}
        mode={closeMode}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeSheet();
          }
        }}
        view={view}
      />
      <TaskMenu
        isMoveOnly={sheet === "move"}
        isOpen={sheet === "menu" || sheet === "move"}
        onEdit={() => {
          setSheet("edit");
        }}
        onOpenChange={(isOpen) => {
          setSheet(isOpen ? (sheet ?? "menu") : null);
        }}
        view={view}
      />
      <EditSheet
        isOpen={sheet === "edit"}
        onOpenChange={(isOpen) => {
          setSheet(isOpen ? "edit" : null);
        }}
        view={view}
      />
    </main>
  );
};

/** Artboards 2–3: one task with its numbers, problems or progress, and what can be done to it. */
export const TaskScreen = ({ taskId }: { readonly taskId: string }) => {
  const t = useT();
  const view = useServices().hooks.useTaskView(taskId);
  if (!view.ok) {
    return (
      <main className="flex flex-1 flex-col items-start gap-4 px-5 py-8">
        <p className="text-sm text-muted">
          {view.error === "task/unknown" ? t("task.notFound") : actionErrorText(t, view.error)}
        </p>
        <Button asChild variant="outline">
          <Link to="/">{t("nav.now")}</Link>
        </Button>
      </main>
    );
  }
  return <TshouldAskDetails view={view.value} />;
};
